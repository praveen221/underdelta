import { readFile } from "node:fs/promises";
import path from "node:path";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([".tf"]);

/** Common Terraform provider prefixes stripped for North-star labels. */
const PROVIDER_PREFIX =
  /^(aws|google|azurerm|azuread|digitalocean|helm|kubernetes|random|null|local|tls|archive|time|external|cloudflare|vercel)_/i;

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
    extractor: "terraform",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

export function isTerraformPath(file: string): boolean {
  return path.extname(file.replaceAll("\\", "/")).toLowerCase() === ".tf";
}

export interface ParsedTerraformResource {
  kind: "resource" | "module";
  /** Provider resource type (`aws_s3_bucket`) or module name. */
  type: string;
  /** Resource name (`notes`) — empty for modules (name lives in `type`). */
  name: string;
  offset: number;
  /** Module `source = "..."` when present. */
  source?: string;
}

/**
 * Dependency-free HCL walker for `resource` / `module` blocks.
 * Typical Terraform layout only — not a full HCL parser.
 */
export function parseTerraformBlocks(source: string): ParsedTerraformResource[] {
  const blocks: ParsedTerraformResource[] = [];
  const resourceRe =
    /^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm;
  const moduleRe = /^\s*module\s+"([^"]+)"\s*\{/gm;

  for (const match of source.matchAll(resourceRe)) {
    const type = match[1] ?? "";
    const name = match[2] ?? "";
    if (!type || !name) continue;
    blocks.push({
      kind: "resource",
      type,
      name,
      offset: match.index ?? 0,
    });
  }

  for (const match of source.matchAll(moduleRe)) {
    const name = match[1] ?? "";
    if (!name) continue;
    const offset = match.index ?? 0;
    // Peek a short window for `source = "..."` inside the module body.
    const window = source.slice(offset, offset + 800);
    const sourceMatch =
      /\bsource\s*=\s*"([^"]+)"/.exec(window) ??
      /\bsource\s*=\s*'([^']+)'/.exec(window);
    blocks.push({
      kind: "module",
      type: name,
      name: "",
      offset,
      ...(sourceMatch?.[1] ? { source: sourceMatch[1] } : {}),
    });
  }

  blocks.sort((a, b) => a.offset - b.offset);
  return blocks;
}

/** Strip provider prefix for canvas vocabulary (`aws_s3_bucket` → `s3_bucket`). */
export function terraformTypeWithoutProvider(type: string): string {
  return type.replace(PROVIDER_PREFIX, "");
}

export const terraformExtractor: ArchitectureExtractor = {
  id: "terraform",
  version: "0.1.0",
  extensions,
  matchesFile: isTerraformPath,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      if (!isTerraformPath(file)) continue;

      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      const moduleId = stableId("module", "terraform", file);
      const moduleEvidence = evidence(file, source, 0, "Terraform configuration");
      if (!seen.has(moduleId)) {
        seen.add(moduleId);
        nodes.push({
          id: moduleId,
          kind: "module",
          label: file,
          qualifiedName: file,
          technology: "terraform",
          metadata: {
            terraform: true,
            terraformModule: true,
            file,
          },
          evidence: [moduleEvidence],
        });
      }

      for (const block of parseTerraformBlocks(source)) {
        if (block.kind === "resource") {
          const address = `${block.type}.${block.name}`;
          const resourceId = stableId("service", "terraform", "resource", address);
          if (seen.has(resourceId)) continue;
          seen.add(resourceId);
          const detail = `resource:${address}`;
          const resourceEvidence = evidence(
            file,
            source,
            block.offset,
            detail,
          );
          nodes.push({
            id: resourceId,
            kind: "service",
            label: address,
            qualifiedName: address,
            technology: "terraform",
            parentId: moduleId,
            metadata: {
              terraform: true,
              terraformResource: true,
              resourceType: block.type,
              resourceName: block.name,
              address,
            },
            evidence: [resourceEvidence],
          });
          edges.push(
            edgeFrom("exposes", moduleId, resourceId, resourceEvidence),
          );
          continue;
        }

        // module "network" { … }
        const moduleAddress = `module.${block.type}`;
        const childId = stableId("service", "terraform", "module", block.type);
        if (seen.has(childId)) continue;
        seen.add(childId);
        const detail = [
          `module:${block.type}`,
          block.source ? `source:${block.source}` : undefined,
        ]
          .filter(Boolean)
          .join(" ");
        const childEvidence = evidence(file, source, block.offset, detail);
        nodes.push({
          id: childId,
          kind: "service",
          label: moduleAddress,
          qualifiedName: moduleAddress,
          technology: "terraform",
          parentId: moduleId,
          metadata: {
            terraform: true,
            terraformModuleBlock: true,
            moduleName: block.type,
            address: moduleAddress,
            ...(block.source ? { moduleSource: block.source } : {}),
          },
          evidence: [childEvidence],
        });
        edges.push(edgeFrom("exposes", moduleId, childId, childEvidence));
      }
    }

    return {
      extractor: { id: "terraform", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
