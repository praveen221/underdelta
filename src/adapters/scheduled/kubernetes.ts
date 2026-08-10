import { readFile } from "node:fs/promises";
import type { SemanticAdapter } from "../../adapter.js";
import { edgeFrom, relativeFile, stableId } from "../../graph.js";
import type { ArchitectureEdge, ArchitectureNode } from "../../schema.js";
import { addScheduledWork, evidenceAt } from "./common.js";

const extensions = new Set([".yaml", ".yml"]);

interface CronJobDocument {
  text: string;
  offset: number;
}

function documents(source: string): CronJobDocument[] {
  const out: CronJobDocument[] = [];
  const marker = /^---\s*$/gm;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    const text = source.slice(start, match.index);
    if (text.trim()) out.push({ text, offset: start });
    start = match.index + match[0].length;
  }
  const tail = source.slice(start);
  if (tail.trim()) out.push({ text: tail, offset: start });
  return out;
}

function value(text: string, key: string): string | undefined {
  const match = new RegExp(
    `^\\s*${key}\\s*:\\s*["']?([^"'#\\n]+?)["']?\\s*(?:#.*)?$`,
    "m",
  ).exec(text);
  return match?.[1]?.trim();
}

export const kubernetesScheduledWorkAdapter: SemanticAdapter = {
  id: "scheduled-kubernetes",
  version: "0.2.0",
  capability: "scheduled-work",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      for (const document of documents(source)) {
        if (!/^\s*kind\s*:\s*CronJob\s*$/m.test(document.text)) continue;
        const metadata = /\bmetadata\s*:\s*\n([\s\S]*?)(?=^spec\s*:)/m.exec(
          document.text,
        )?.[1];
        const name = metadata ? value(metadata, "name") : undefined;
        const expression = value(document.text, "schedule");
        if (!name || !expression) continue;
        const namespace = metadata ? value(metadata, "namespace") : undefined;
        const address = namespace
          ? `CronJob/${namespace}/${name}`
          : `CronJob/${name}`;
        const moduleId = stableId("module", "kubernetes", file);
        const resourceId = stableId("service", "kubernetes", address);
        const item = evidenceAt(
          this.id,
          file,
          source,
          document.offset,
          `Kubernetes CronJob ${name} schedule ${expression}`,
        );
        const { jobId } = addScheduledWork(nodes, edges, {
          baseNodes: context.nodes,
          file,
          provider: "kubernetes",
          name,
          expression,
          ...(value(document.text, "timeZone")
            ? { timezone: value(document.text, "timeZone")! }
            : {}),
          triggerKind: "cron",
          declaration: "infrastructure",
          executionKind: "container",
          evidence: item,
          parentId: moduleId,
        });
        nodes.push({
          id: resourceId,
          kind: "service",
          label: `CronJob/${name}`,
          qualifiedName: address,
          parentId: moduleId,
          technology: "kubernetes",
          metadata: {},
          evidence: [item],
        });
        edges.push(edgeFrom("uses", jobId, resourceId, item));
      }
    }

    return {
      adapter: {
        id: this.id,
        version: this.version,
        capability: this.capability,
      },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
