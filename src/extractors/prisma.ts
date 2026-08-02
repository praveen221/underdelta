import { readFile } from "node:fs/promises";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([".prisma"]);
const scalarTypes = new Set([
  "BigInt",
  "Boolean",
  "Bytes",
  "DateTime",
  "Decimal",
  "Float",
  "Int",
  "Json",
  "String",
  "Unsupported",
]);

function lineEvidence(
  file: string,
  startLine: number,
  endLine = startLine,
  detail?: string,
): Evidence {
  const evidence: Evidence = {
    file,
    range: {
      startLine,
      startColumn: 0,
      endLine,
      endColumn: 0,
    },
    extractor: "prisma",
    certainty: "observed",
  };
  if (detail !== undefined) evidence.detail = detail;
  return evidence;
}

export const prismaExtractor: ArchitectureExtractor = {
  id: "prisma",
  version: "0.1.0",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      const lines = source.split(/\r?\n/);
      const databaseId = stableId("database", "prisma", file);
      nodes.push({
        id: databaseId,
        kind: "database",
        label: "Prisma database",
        technology: "prisma",
        metadata: {},
        evidence: [lineEvidence(file, 1, Math.max(lines.length, 1))],
      });

      const models = new Set<string>();
      for (const match of source.matchAll(/\bmodel\s+([A-Za-z_]\w*)\s*\{/g)) {
        const model = match[1];
        if (model) models.add(model);
      }

      let index = 0;
      while (index < lines.length) {
        const header = /^\s*model\s+([A-Za-z_]\w*)\s*\{/.exec(lines[index] ?? "");
        if (!header?.[1]) {
          index += 1;
          continue;
        }

        const model = header[1];
        const modelStart = index + 1;
        let modelEnd = modelStart;
        const fields: Array<{
          name: string;
          type: string;
          line: number;
          attributes: string;
        }> = [];

        index += 1;
        while (index < lines.length && !/^\s*\}/.test(lines[index] ?? "")) {
          const line = lines[index] ?? "";
          const field =
            /^\s*([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\[\])?(\?)?\s*(.*)$/.exec(
              line,
            );
          if (field?.[1] && field[2] && !field[1].startsWith("@@")) {
            fields.push({
              name: field[1],
              type: field[2],
              line: index + 1,
              attributes: field[5] ?? "",
            });
          }
          modelEnd = index + 1;
          index += 1;
        }

        const tableId = stableId("table", "prisma", model);
        nodes.push({
          id: tableId,
          kind: "table",
          label: model,
          parentId: databaseId,
          technology: "prisma",
          metadata: { fieldCount: fields.length },
          evidence: [lineEvidence(file, modelStart, modelEnd)],
        });
        edges.push(
          edgeFrom(
            "contains",
            databaseId,
            tableId,
            lineEvidence(file, modelStart, modelEnd),
          ),
        );

        for (const field of fields) {
          const columnId = stableId("column", "prisma", model, field.name);
          const isRelation = models.has(field.type) && !scalarTypes.has(field.type);
          nodes.push({
            id: columnId,
            kind: "column",
            label: field.name,
            parentId: tableId,
            technology: "prisma",
            metadata: {
              type: field.type,
              relation: isRelation,
              attributes: field.attributes,
            },
            evidence: [lineEvidence(file, field.line)],
          });
          edges.push(
            edgeFrom(
              "contains",
              tableId,
              columnId,
              lineEvidence(file, field.line),
            ),
          );

          if (isRelation) {
            edges.push(
              edgeFrom(
                "depends-on",
                tableId,
                stableId("table", "prisma", field.type),
                lineEvidence(file, field.line),
                field.name,
              ),
            );
          }
        }
        index += 1;
      }
    }

    return {
      extractor: { id: this.id, version: this.version },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
