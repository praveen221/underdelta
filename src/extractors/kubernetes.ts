import { readFile } from "node:fs/promises";
import path from "node:path";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([".yaml", ".yml"]);

/** Workload / exposure kinds that tell a Deploy story on the default map. */
const PRODUCT_KINDS = new Set([
  "Deployment",
  "Service",
  "Ingress",
  "StatefulSet",
  "DaemonSet",
  "CronJob",
  "Job",
]);

/** Workloads that own pod selectors Services can target. */
const SELECTABLE_WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
]);

function evidence(
  file: string,
  source: string,
  offset: number,
  detail?: string,
): Evidence {
  const before = source.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const item: Evidence = {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor: "kubernetes",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

/** Conventional Kubernetes manifest locations / filenames. */
export function isKubernetesManifestPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  const base = path.basename(normalized);
  if (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml" ||
    /^docker-compose\.[^/]+\.ya?ml$/.test(base) ||
    /(^|\/)(openapi|swagger)\.(ya?ml)$/.test(normalized) ||
    /(?:^|\/)openapi\//.test(normalized) ||
    // Helm templates are Go-templated stubs — not product workload surface.
    /(^|\/)charts?\//.test(normalized) ||
    /(^|\/)helm(?:-?chart)?\//.test(normalized) ||
    // CI / release-cluster wiring is chrome beside the product manifests.
    /(^|\/)\.github\//.test(normalized)
  ) {
    return false;
  }
  return (
    // `k8s/`, `kubernetes/`, `manifests/`, and hyphenated folders like
    // `kubernetes-manifests/` (Online Boutique) / `k8s-manifests/`.
    /(^|\/)(k8s|kubernetes)(-?manifests?)?(\/|$)/.test(normalized) ||
    /(^|\/)manifests?(\/|$)/.test(normalized) ||
    /(^|\/)deploy(?:ment)?s?\//.test(normalized) ||
    // Kustomize overlay trees often ship optional workload components.
    /(^|\/)kustomize\//.test(normalized) ||
    /\.(?:deployment|service|ingress|statefulset|daemonset|cronjob)\.ya?ml$/.test(
      normalized,
    ) ||
    /(?:^|\/)(?:deployment|service|ingress)\.ya?ml$/.test(normalized)
  );
}

export function looksLikeKubernetesManifest(source: string): boolean {
  const head = source.slice(0, 2000);
  return /^\s*apiVersion\s*:/m.test(head) && /^\s*kind\s*:/m.test(head);
}

export interface ParsedKubernetesResource {
  apiVersion: string;
  kind: string;
  name: string;
  offset: number;
  namespace?: string;
  /** Service `spec.selector` flat labels (app: api). */
  selector?: Record<string, string>;
  /** Deployment/StatefulSet/DaemonSet `spec.selector.matchLabels`. */
  matchLabels?: Record<string, string>;
  /** Ingress rule hosts (notes.example.com). */
  hosts?: string[];
  /** Ingress backend Service names (rules + defaultBackend). */
  backendServices?: string[];
}

/**
 * Parse indented `key: value` pairs under a YAML mapping block.
 * Stops when indentation returns to or above the block key.
 */
function parseIndentedMap(
  text: string,
  blockKeyRe: RegExp,
): Record<string, string> | undefined {
  const match = blockKeyRe.exec(text);
  if (!match || match.index === undefined) return undefined;
  const afterKey = text.slice(match.index + match[0].length);
  const lines = afterKey.split(/\r?\n/);
  // First non-empty line sets the child indent.
  let childIndent: number | null = null;
  const out: Record<string, string> = {};
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (childIndent === null) {
      // Still on the same line as the key (inline map) — rare; skip.
      if (indent === 0 && match[0].includes("\n") === false && lines[0] === line) {
        // Fall through — treat as block content if indented below.
      }
      if (indent === 0) break;
      childIndent = indent;
    }
    if (indent < childIndent) break;
    if (indent > childIndent) continue; // nested deeper than flat labels
    const kv = /^\s*([^:#\s][^:]*)\s*:\s*["']?([^"'#\n]*?)["']?\s*$/.exec(line);
    if (!kv) continue;
    const key = kv[1]?.trim();
    const value = kv[2]?.trim();
    if (!key || value === undefined || value === "") continue;
    // Skip nested map markers (`matchLabels:` as a value-less key was the block).
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Collect Ingress `host:` lines and backend `service.name` references. */
function parseIngressWiring(text: string): {
  hosts?: string[];
  backendServices?: string[];
} {
  const hosts: string[] = [];
  // Rules often use list items: `- host: notes.example.com`
  for (const match of text.matchAll(
    /^\s*-?\s*host\s*:\s*["']?([^"'#\n]+?)["']?\s*$/gm,
  )) {
    const host = match[1]?.trim();
    if (host && !/\{\{/.test(host)) hosts.push(host);
  }

  const backendServices: string[] = [];
  // Typical Ingress backend:
  //   backend:
  //     service:
  //       name: api
  // Also defaultBackend with the same shape.
  for (const match of text.matchAll(
    /\b(?:defaultB|b)ackend\s*:\s*\n([\s\S]{0,400}?)(?=\n\S|\n---|\n\s{0,2}\w+\s*:|$)/g,
  )) {
    const window = match[1] ?? "";
    const nameMatch =
      /^\s*name\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(window) ||
      /service\s*:\s*\n\s*name\s*:\s*["']?([^"'#\n]+?)["']?/m.exec(window);
    const name = nameMatch?.[1]?.trim();
    if (name && !/\{\{/.test(name)) backendServices.push(name);
  }
  // Path backends often nest deeper than the coarse window — also scan
  // `service:\n  name:` pairs under the Ingress doc.
  for (const match of text.matchAll(
    /^\s*service\s*:\s*\n\s+name\s*:\s*["']?([^"'#\n]+?)["']?\s*$/gm,
  )) {
    const name = match[1]?.trim();
    if (name && !/\{\{/.test(name)) backendServices.push(name);
  }

  return {
    ...(hosts.length ? { hosts: [...new Set(hosts)] } : {}),
    ...(backendServices.length
      ? { backendServices: [...new Set(backendServices)] }
      : {}),
  };
}

/**
 * Dependency-free multi-doc YAML walker for Kubernetes manifests.
 * Typical layout only — not a full YAML parser.
 */
export function parseKubernetesResources(
  source: string,
): ParsedKubernetesResource[] {
  const resources: ParsedKubernetesResource[] = [];
  // Split on document markers; keep offsets via cumulative scan.
  const parts: Array<{ text: string; offset: number }> = [];
  const markerRe = /^---\s*$/gm;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(source)) !== null) {
    const text = source.slice(last, match.index);
    if (text.trim()) parts.push({ text, offset: last });
    last = match.index + match[0].length;
  }
  const tail = source.slice(last);
  if (tail.trim()) parts.push({ text: tail, offset: last });
  if (parts.length === 0 && source.trim()) {
    parts.push({ text: source, offset: 0 });
  }

  for (const part of parts) {
    const apiMatch = /^\s*apiVersion\s*:\s*["']?([^\s"'#]+)/m.exec(part.text);
    const kindMatch = /^\s*kind\s*:\s*["']?([^\s"'#]+)/m.exec(part.text);
    if (!apiMatch || !kindMatch) continue;
    const kind = kindMatch[1] ?? "";
    if (!PRODUCT_KINDS.has(kind)) continue;

    // metadata.name — prefer the first name under a metadata: block.
    const metaBlock = /\bmetadata\s*:\s*\n([\s\S]{0,800})/.exec(part.text);
    const metaWindow = metaBlock?.[1] ?? part.text.slice(0, 600);
    const nameMatch =
      /^\s*name\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(metaWindow);
    const name = nameMatch?.[1]?.trim();
    if (!name) continue;
    const nsMatch =
      /^\s*namespace\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(metaWindow);

    // Offset of the kind line inside the document for evidence.
    const kindLine = kindMatch.index ?? 0;
    const resource: ParsedKubernetesResource = {
      apiVersion: apiMatch[1] ?? "",
      kind,
      name,
      offset: part.offset + kindLine,
      ...(nsMatch?.[1]?.trim() ? { namespace: nsMatch[1].trim() } : {}),
    };

    if (kind === "Service") {
      // Service selector is a flat map (not matchLabels).
      const selector = parseIndentedMap(
        part.text,
        /^\s*selector\s*:\s*(?:\{\s*\})?\s*$/m,
      );
      if (selector) resource.selector = selector;
    }

    if (SELECTABLE_WORKLOAD_KINDS.has(kind)) {
      const matchLabels = parseIndentedMap(
        part.text,
        /^\s*matchLabels\s*:\s*(?:\{\s*\})?\s*$/m,
      );
      if (matchLabels) resource.matchLabels = matchLabels;
    }

    if (kind === "Ingress") {
      const wiring = parseIngressWiring(part.text);
      if (wiring.hosts) resource.hosts = wiring.hosts;
      if (wiring.backendServices) resource.backendServices = wiring.backendServices;
    }

    resources.push(resource);
  }

  return resources;
}

function labelsMatch(
  selector: Record<string, string>,
  target: Record<string, string>,
): boolean {
  const keys = Object.keys(selector);
  if (keys.length === 0) return false;
  return keys.every((key) => target[key] === selector[key]);
}

function isNonKubernetesYamlPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  const base = path.basename(normalized);
  return (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml" ||
    /^docker-compose\.[^/]+\.ya?ml$/.test(base) ||
    /(^|\/)(openapi|swagger)\.(ya?ml)$/.test(normalized) ||
    /(?:^|\/)openapi\//.test(normalized) ||
    // Kustomization index files are not workloads.
    base === "kustomization.yaml" ||
    base === "kustomization.yml"
  );
}

export const kubernetesExtractor: ArchitectureExtractor = {
  id: "kubernetes",
  version: "0.1.0",
  extensions,
  // Prefer conventional k8s paths; extract() still accepts any yaml that
  // looks like a manifest (apiVersion + kind) so scattered deploy/*.yaml work.
  matchesFile: isKubernetesManifestPath,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();
    const resourcesById = new Map<
      string,
      ParsedKubernetesResource & { id: string; file: string }
    >();

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const ext = path.extname(file.replaceAll("\\", "/")).toLowerCase();
      if (ext !== ".yaml" && ext !== ".yml") continue;
      if (isNonKubernetesYamlPath(file)) continue;
      // Prefer path conventions; still accept scattered apiVersion+kind yaml,
      // but never treat Helm chart templates / .github CI manifests as product.
      const normalizedFile = file.replaceAll("\\", "/").toLowerCase();
      if (
        /(^|\/)charts?\//.test(normalizedFile) ||
        /(^|\/)helm(?:-?chart)?\//.test(normalizedFile) ||
        /(^|\/)\.github\//.test(normalizedFile)
      ) {
        continue;
      }

      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      if (!looksLikeKubernetesManifest(source)) continue;
      const resources = parseKubernetesResources(source).filter(
        // Skip Go-template placeholder names (`{{ .Values.frontend.name }}`).
        (resource) => !/\{\{/.test(resource.name),
      );
      if (resources.length === 0) continue;

      const moduleId = stableId("module", "kubernetes", file);
      const moduleEvidence = evidence(
        file,
        source,
        0,
        "Kubernetes manifest",
      );
      if (!seen.has(moduleId)) {
        seen.add(moduleId);
        nodes.push({
          id: moduleId,
          kind: "module",
          label: file,
          qualifiedName: file,
          technology: "kubernetes",
          metadata: {
            kubernetes: true,
            kubernetesModule: true,
            file,
            ...(/(^|\/)kustomize\//i.test(file)
              ? { kustomizeChrome: true }
              : {}),
          },
          evidence: [moduleEvidence],
        });
      }

      for (const resource of resources) {
        const address = resource.namespace
          ? `${resource.kind}/${resource.namespace}/${resource.name}`
          : `${resource.kind}/${resource.name}`;
        const resourceId = stableId("service", "kubernetes", address);
        if (seen.has(resourceId)) continue;
        seen.add(resourceId);
        const detailParts = [`kind:${resource.kind} name:${resource.name}`];
        if (resource.hosts?.length) {
          detailParts.push(`hosts:${resource.hosts.join(",")}`);
        }
        if (resource.backendServices?.length) {
          detailParts.push(`backends:${resource.backendServices.join(",")}`);
        }
        const resourceEvidence = evidence(
          file,
          source,
          resource.offset,
          detailParts.join(" "),
        );
        nodes.push({
          id: resourceId,
          kind: "service",
          label: `${resource.kind}/${resource.name}`,
          qualifiedName: address,
          technology: "kubernetes",
          parentId: moduleId,
          metadata: {
            kubernetes: true,
            kubernetesResource: true,
            apiVersion: resource.apiVersion,
            k8sKind: resource.kind,
            resourceName: resource.name,
            address,
            ...(resource.namespace ? { namespace: resource.namespace } : {}),
            ...(resource.selector ? { selector: resource.selector } : {}),
            ...(resource.matchLabels
              ? { matchLabels: resource.matchLabels }
              : {}),
            ...(resource.hosts?.length ? { hosts: resource.hosts } : {}),
            ...(resource.backendServices?.length
              ? { backendServices: resource.backendServices }
              : {}),
            ...(/(^|\/)kustomize\//i.test(file)
              ? { kustomizeChrome: true }
              : {}),
          },
          evidence: [resourceEvidence],
        });
        edges.push(
          edgeFrom("exposes", moduleId, resourceId, resourceEvidence),
        );
        resourcesById.set(resourceId, { ...resource, id: resourceId, file });
      }
    }

    // Service selector → Deployment/StatefulSet/DaemonSet matchLabels (needs).
    const workloads = [...resourcesById.values()].filter((resource) =>
      SELECTABLE_WORKLOAD_KINDS.has(resource.kind),
    );
    const services = [...resourcesById.values()].filter(
      (resource) => resource.kind === "Service",
    );
    for (const service of services) {
      if (!service.selector) continue;
      for (const workload of workloads) {
        if (!workload.matchLabels) continue;
        // Prefer same-namespace matches when both declare one.
        if (
          service.namespace &&
          workload.namespace &&
          service.namespace !== workload.namespace
        ) {
          continue;
        }
        if (!labelsMatch(service.selector, workload.matchLabels)) continue;
        const depEvidence = evidence(
          service.file,
          "",
          0,
          `needs ${workload.kind}/${workload.name}`,
        );
        // Reuse first real evidence line when available.
        const realEvidence = nodes.find((node) => node.id === service.id)
          ?.evidence[0];
        edges.push(
          edgeFrom(
            "depends-on",
            service.id,
            workload.id,
            {
              ...(realEvidence ?? depEvidence),
              detail: `needs ${workload.kind}/${workload.name}`,
            },
            "needs",
          ),
        );
      }
    }

    // Ingress backend → Service (needs).
    const ingresses = [...resourcesById.values()].filter(
      (resource) => resource.kind === "Ingress",
    );
    for (const ingress of ingresses) {
      for (const backendName of ingress.backendServices ?? []) {
        const target = services.find((service) => {
          if (service.name !== backendName) return false;
          if (
            ingress.namespace &&
            service.namespace &&
            ingress.namespace !== service.namespace
          ) {
            return false;
          }
          return true;
        });
        if (!target) continue;
        const realEvidence = nodes.find((node) => node.id === ingress.id)
          ?.evidence[0];
        edges.push(
          edgeFrom(
            "depends-on",
            ingress.id,
            target.id,
            {
              ...(realEvidence ??
                evidence(
                  ingress.file,
                  "",
                  0,
                  `needs Service/${backendName}`,
                )),
              detail: `needs Service/${backendName}`,
            },
            "needs",
          ),
        );
      }
    }

    return {
      extractor: { id: "kubernetes", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
