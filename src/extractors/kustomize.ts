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
    extractor: "kustomize",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

export function isKustomizationYaml(file: string): boolean {
  const base = path.basename(file.replaceAll("\\", "/")).toLowerCase();
  return base === "kustomization.yaml" || base === "kustomization.yml";
}

/**
 * Conventional Kustomize trees (`kustomize/`, `overlays/`, `bases/`,
 * `base/` at a path segment).
 */
export function isKustomizeTreePath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  return (
    /(^|\/)kustomize\//.test(normalized) ||
    /(^|\/)overlays?\//.test(normalized) ||
    /(^|\/)bases?\//.test(normalized)
  );
}

export function isKustomizePath(file: string): boolean {
  return isKustomizationYaml(file) || isKustomizeTreePath(file);
}

/** Base vs Overlay from path — `deploy/bases/backend` → base. */
export function kustomizeRoleFromPath(
  fileOrRoot: string,
): "base" | "overlay" {
  const normalized = fileOrRoot.replaceAll("\\", "/").toLowerCase();
  if (/(^|\/)bases?\//.test(normalized)) return "base";
  return "overlay";
}

export interface ParsedKustomization {
  /** Directory basename — product overlay/base identity. */
  name: string;
  offset: number;
  namespace?: string;
  namePrefix?: string;
  nameSuffix?: string;
  /** Combined `resources:` + legacy `bases:` entries (needs targets). */
  resources: string[];
  /** True when the file used the legacy `bases:` key. */
  legacyBases?: boolean;
}

/** Read a YAML list under a top-level `key:` block. */
function readYamlStringList(source: string, key: string): string[] {
  const keyMatch = new RegExp(`^\\s*${key}\\s*:\\s*$`, "m").exec(source);
  if (!keyMatch || keyMatch.index === undefined) return [];
  const values: string[] = [];
  const after = source.slice(keyMatch.index + keyMatch[0].length);
  for (const line of after.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = /^\s*-\s+["']?([^"'#\n]+?)["']?\s*$/.exec(line);
    if (!item) {
      // Next top-level key ends the list.
      if (/^[A-Za-z_]/.test(line)) break;
      continue;
    }
    const value = item[1]?.trim();
    if (value) values.push(value);
  }
  return values;
}

/**
 * Dependency-free kustomization.yaml walker — typical Kustomize identity
 * fields only (name from directory; optional namespace/prefix/suffix/resources).
 * Also accepts the legacy `bases:` key (pre-resources Kustomize).
 */
export function parseKustomizationYaml(
  source: string,
  overlayDirName: string,
): ParsedKustomization | undefined {
  const kindMatch = /^\s*kind\s*:\s*["']?Kustomization["']?\s*$/m.exec(source);
  const apiMatch =
    /^\s*apiVersion\s*:\s*["']?kustomize\.config\.k8s\.io\//m.exec(source);
  // Accept kind: Kustomization alone — some trees omit apiVersion in samples.
  if (!kindMatch && !apiMatch) {
    // Still accept resource-list files named kustomization.yaml without kind
    // when they declare a resources: or legacy bases: block.
    if (
      !/^\s*resources\s*:\s*$/m.test(source) &&
      !/^\s*bases\s*:\s*$/m.test(source)
    ) {
      return undefined;
    }
  }

  const name = overlayDirName.trim();
  if (!name || name === "." || name === "/") return undefined;

  const namespaceMatch =
    /^\s*namespace\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const prefixMatch =
    /^\s*namePrefix\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const suffixMatch =
    /^\s*nameSuffix\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);

  const resourceEntries = readYamlStringList(source, "resources");
  const baseEntries = readYamlStringList(source, "bases");
  const resources = [...baseEntries, ...resourceEntries];
  if (
    resources.length === 0 &&
    !kindMatch &&
    !apiMatch &&
    !namespaceMatch &&
    !prefixMatch
  ) {
    return undefined;
  }

  const offset = kindMatch?.index ?? apiMatch?.index ?? 0;
  return {
    name,
    offset,
    ...(namespaceMatch?.[1]?.trim()
      ? { namespace: namespaceMatch[1].trim() }
      : {}),
    ...(prefixMatch?.[1]?.trim() ? { namePrefix: prefixMatch[1].trim() } : {}),
    ...(suffixMatch?.[1]?.trim() ? { nameSuffix: suffixMatch[1].trim() } : {}),
    resources,
    ...(baseEntries.length > 0 ? { legacyBases: true } : {}),
  };
}

/** Resolve a resources: entry to a directory root that may host a hub. */
function resolveResourceRoot(overlayRoot: string, resource: string): string {
  let resolved = path.posix.normalize(
    path.posix.join(overlayRoot, resource.replaceAll("\\", "/")),
  );
  if (resolved.startsWith("./")) resolved = resolved.slice(2);
  const base = path.posix.basename(resolved).toLowerCase();
  if (base === "kustomization.yaml" || base === "kustomization.yml") {
    resolved = path.posix.dirname(resolved);
  }
  return resolved;
}

export const kustomizeExtractor: ArchitectureExtractor = {
  id: "kustomize",
  version: "0.1.0",
  extensions,
  matchesFile: isKustomizePath,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();
    const hubs: Array<{
      id: string;
      overlayRoot: string;
      resources: string[];
      file: string;
      source: string;
      offset: number;
      name: string;
      role: "base" | "overlay";
    }> = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      if (!isKustomizationYaml(file)) continue;

      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      const normalized = file.replaceAll("\\", "/");
      const overlayRoot = path.posix.dirname(normalized);
      const overlayName =
        overlayRoot === "."
          ? "root"
          : (overlayRoot.split("/").filter(Boolean).pop() ?? "root");

      const kustomization = parseKustomizationYaml(source, overlayName);
      if (!kustomization) continue;

      const role = kustomizeRoleFromPath(normalized);
      const moduleId = stableId("module", "kustomize", file);
      const moduleEvidence = evidence(
        file,
        source,
        0,
        "Kustomize kustomization.yaml",
      );
      if (!seen.has(moduleId)) {
        seen.add(moduleId);
        nodes.push({
          id: moduleId,
          kind: "module",
          label: file,
          qualifiedName: file,
          technology: "kustomize",
          metadata: {
            kustomize: true,
            kustomizeModule: true,
            kustomizationYaml: true,
            file,
            overlayName: kustomization.name,
            overlayRoot,
            kustomizeRole: role,
          },
          evidence: [moduleEvidence],
        });
      }

      const rolePrefix = role === "base" ? "Base" : "Overlay";
      const address = `${rolePrefix}/${kustomization.name}`;
      const overlayId = stableId(
        "service",
        "kustomize",
        role,
        overlayRoot,
        kustomization.name,
      );
      if (seen.has(overlayId)) continue;
      seen.add(overlayId);

      const detailParts = [`${role}:${kustomization.name}`];
      if (kustomization.namespace) {
        detailParts.push(`namespace:${kustomization.namespace}`);
      }
      if (kustomization.namePrefix) {
        detailParts.push(`namePrefix:${kustomization.namePrefix}`);
      }
      if (kustomization.legacyBases) {
        detailParts.push("legacyBases");
      }
      if (kustomization.resources.length > 0) {
        detailParts.push(`resources:${kustomization.resources.length}`);
      }
      const overlayEvidence = evidence(
        file,
        source,
        kustomization.offset,
        detailParts.join(" "),
      );

      nodes.push({
        id: overlayId,
        kind: "service",
        label: address,
        qualifiedName: address,
        technology: "kustomize",
        parentId: moduleId,
        metadata: {
          kustomize: true,
          kustomization: true,
          overlayName: kustomization.name,
          address,
          overlayRoot,
          kustomizeRole: role,
          ...(kustomization.namespace
            ? { namespace: kustomization.namespace }
            : {}),
          ...(kustomization.namePrefix
            ? { namePrefix: kustomization.namePrefix }
            : {}),
          ...(kustomization.nameSuffix
            ? { nameSuffix: kustomization.nameSuffix }
            : {}),
          ...(kustomization.legacyBases ? { legacyBases: true } : {}),
          ...(kustomization.resources.length > 0
            ? { resources: kustomization.resources }
            : {}),
          // Boutique-style trees under kustomize/components stay tagged so
          // projection can quiet them beside kubernetes-manifests. Product
          // trees under kustomize/bases|overlays must NOT be chrome.
          ...(/(^|\/)kustomize\/components\//i.test(normalized)
            ? { kustomizeChrome: true }
            : {}),
        },
        evidence: [overlayEvidence],
      });
      edges.push(edgeFrom("exposes", moduleId, overlayId, overlayEvidence));
      hubs.push({
        id: overlayId,
        overlayRoot,
        resources: kustomization.resources,
        file,
        source,
        offset: kustomization.offset,
        name: kustomization.name,
        role,
      });
    }

    // Overlay → Base needs from resources: ../../bases/backend entries.
    const hubsByRoot = new Map<string, (typeof hubs)[number]>();
    for (const hub of hubs) {
      hubsByRoot.set(hub.overlayRoot, hub);
    }
    for (const hub of hubs) {
      for (const resource of hub.resources) {
        const resolved = resolveResourceRoot(hub.overlayRoot, resource);
        if (resolved === hub.overlayRoot) continue;
        const target = hubsByRoot.get(resolved);
        if (!target) continue;
        const depEvidence = evidence(
          hub.file,
          hub.source,
          hub.offset,
          `needs ${target.role}:${target.name}`,
        );
        edges.push(
          edgeFrom(
            "depends-on",
            hub.id,
            target.id,
            depEvidence,
            "needs",
          ),
        );
      }
    }

    return {
      extractor: { id: "kustomize", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
