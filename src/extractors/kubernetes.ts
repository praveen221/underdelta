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
    resources.push({
      apiVersion: apiMatch[1] ?? "",
      kind,
      name,
      offset: part.offset + kindLine,
      ...(nsMatch?.[1]?.trim() ? { namespace: nsMatch[1].trim() } : {}),
    });
  }

  return resources;
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
    /(?:^|\/)openapi\//.test(normalized)
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
        const detail = `kind:${resource.kind} name:${resource.name}`;
        const resourceEvidence = evidence(
          file,
          source,
          resource.offset,
          detail,
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
          },
          evidence: [resourceEvidence],
        });
        edges.push(
          edgeFrom("exposes", moduleId, resourceId, resourceEvidence),
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
