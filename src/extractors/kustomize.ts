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

export interface ParsedKustomization {
  /** Directory basename — product overlay/base identity. */
  name: string;
  offset: number;
  namespace?: string;
  namePrefix?: string;
  nameSuffix?: string;
  resources: string[];
}

/**
 * Dependency-free kustomization.yaml walker — typical Kustomize identity
 * fields only (name from directory; optional namespace/prefix/suffix/resources).
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
    // when they declare a resources: block (legacy / simplified fixtures).
    if (!/^\s*resources\s*:\s*$/m.test(source)) return undefined;
  }

  const name = overlayDirName.trim();
  if (!name || name === "." || name === "/") return undefined;

  const namespaceMatch =
    /^\s*namespace\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const prefixMatch =
    /^\s*namePrefix\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const suffixMatch =
    /^\s*nameSuffix\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);

  const resources: string[] = [];
  const resourcesKey = /^\s*resources\s*:\s*$/m.exec(source);
  if (resourcesKey && resourcesKey.index !== undefined) {
    const after = source.slice(resourcesKey.index + resourcesKey[0].length);
    for (const line of after.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const item = /^\s*-\s+["']?([^"'#\n]+?)["']?\s*$/.exec(line);
      if (!item) {
        // Next top-level key ends the list.
        if (/^[A-Za-z_]/.test(line)) break;
        continue;
      }
      const value = item[1]?.trim();
      if (value) resources.push(value);
    }
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
  };
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
          },
          evidence: [moduleEvidence],
        });
      }

      const address = `Overlay/${kustomization.name}`;
      const overlayId = stableId(
        "service",
        "kustomize",
        "overlay",
        overlayRoot,
        kustomization.name,
      );
      if (seen.has(overlayId)) continue;
      seen.add(overlayId);

      const detailParts = [`overlay:${kustomization.name}`];
      if (kustomization.namespace) {
        detailParts.push(`namespace:${kustomization.namespace}`);
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
          ...(kustomization.namespace
            ? { namespace: kustomization.namespace }
            : {}),
          ...(kustomization.namePrefix
            ? { namePrefix: kustomization.namePrefix }
            : {}),
          ...(kustomization.nameSuffix
            ? { nameSuffix: kustomization.nameSuffix }
            : {}),
          ...(kustomization.resources.length > 0
            ? { resources: kustomization.resources }
            : {}),
          // Boutique-style trees under kustomize/components stay tagged so
          // projection can quiet them beside kubernetes-manifests.
          ...(/(^|\/)kustomize\//i.test(normalized)
            ? { kustomizeChrome: true }
            : {}),
        },
        evidence: [overlayEvidence],
      });
      edges.push(edgeFrom("exposes", moduleId, overlayId, overlayEvidence));
    }

    return {
      extractor: { id: "kustomize", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
