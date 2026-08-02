import { readFile } from "node:fs/promises";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([".sql"]);

function evidence(file: string, source: string, offset: number): Evidence {
  const before = source.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  return {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor: "sql",
    certainty: "observed",
  };
}

function cleanIdentifier(identifier: string): string {
  return identifier.replaceAll(/["'`[\]]/g, "");
}

export const sqlExtractor: ArchitectureExtractor = {
  id: "sql",
  version: "0.1.0",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      const migrationId = stableId("schema", "migration", file);
      nodes.push({
        id: migrationId,
        kind: "schema",
        label: file,
        technology: "sql",
        metadata: { role: "migration" },
        evidence: [
          {
            file,
            extractor: "sql",
            certainty: "observed",
          },
        ],
      });

      const tablePattern =
        /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`[\]]+)\s*\(([\s\S]*?)\)\s*;/gi;
      for (const match of source.matchAll(tablePattern)) {
        const rawTable = match[1];
        if (!rawTable || match.index === undefined) continue;
        const table = cleanIdentifier(rawTable);
        const tableId = stableId("table", "sql", table);
        const tableEvidence = evidence(file, source, match.index);
        nodes.push({
          id: tableId,
          kind: "table",
          label: table,
          technology: "sql",
          metadata: {},
          evidence: [tableEvidence],
        });
        edges.push(
          edgeFrom("migrates", migrationId, tableId, tableEvidence, "creates"),
        );

        const body = match[2] ?? "";
        for (const definition of body.split(",")) {
          const column = /^\s*([A-Za-z_][\w$]*)\s+([A-Za-z][\w()]*)/i.exec(
            definition,
          );
          if (!column?.[1] || !column[2]) continue;
          if (
            ["CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK"].includes(
              column[1].toUpperCase(),
            )
          ) {
            continue;
          }
          const columnId = stableId("column", "sql", table, column[1]);
          nodes.push({
            id: columnId,
            kind: "column",
            label: column[1],
            parentId: tableId,
            technology: "sql",
            metadata: { type: column[2] },
            evidence: [tableEvidence],
          });
          edges.push(
            edgeFrom("contains", tableId, columnId, tableEvidence),
          );
        }
      }

      const alterPattern =
        /\bALTER\s+TABLE\s+([A-Za-z0-9_."`[\]]+)\s+([\s\S]*?);/gi;
      for (const match of source.matchAll(alterPattern)) {
        const rawTable = match[1];
        if (!rawTable || match.index === undefined) continue;
        const table = cleanIdentifier(rawTable);
        const tableId = stableId("table", "sql", table);
        const alterEvidence = evidence(file, source, match.index);
        nodes.push({
          id: tableId,
          kind: "table",
          label: table,
          technology: "sql",
          metadata: {},
          evidence: [alterEvidence],
        });
        edges.push(
          edgeFrom("migrates", migrationId, tableId, alterEvidence, "alters"),
        );
      }

      // Column-level and table-level FOREIGN KEY → table relations.
      const fkPattern =
        /\b(?:FOREIGN\s+KEY\s*\([^)]+\)\s*)?REFERENCES\s+([A-Za-z0-9_."`[\]]+)\s*(?:\([^)]*\))?/gi;
      const createTableHeaders =
        /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`[\]]+)\s*\(/gi;
      const tableStarts: Array<{ table: string; index: number }> = [];
      for (const match of source.matchAll(createTableHeaders)) {
        if (!match[1] || match.index === undefined) continue;
        tableStarts.push({
          table: cleanIdentifier(match[1]),
          index: match.index,
        });
      }
      for (const match of source.matchAll(fkPattern)) {
        const rawTarget = match[1];
        if (!rawTarget || match.index === undefined) continue;
        const targetTable = cleanIdentifier(rawTarget);
        let sourceTable: string | undefined;
        for (const start of tableStarts) {
          if (start.index <= match.index) sourceTable = start.table;
          else break;
        }
        if (!sourceTable || sourceTable === targetTable) continue;
        const fkEvidence = evidence(file, source, match.index);
        const sourceId = stableId("table", "sql", sourceTable);
        const targetId = stableId("table", "sql", targetTable);
        if (!nodes.some((node) => node.id === sourceId)) {
          nodes.push({
            id: sourceId,
            kind: "table",
            label: sourceTable,
            technology: "sql",
            metadata: {},
            evidence: [fkEvidence],
          });
        }
        if (!nodes.some((node) => node.id === targetId)) {
          nodes.push({
            id: targetId,
            kind: "table",
            label: targetTable,
            technology: "sql",
            metadata: {},
            evidence: [fkEvidence],
          });
        }
        edges.push(
          edgeFrom(
            "depends-on",
            sourceId,
            targetId,
            { ...fkEvidence, detail: `FOREIGN KEY references ${targetTable}` },
            "references",
          ),
        );
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
