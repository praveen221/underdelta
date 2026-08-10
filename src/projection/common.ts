import type { Evidence } from "../schema.js";

export function projectionEvidence(file: string, detail?: string): Evidence {
  const evidence: Evidence = {
    file,
    extractor: "projection",
    certainty: "derived",
  };
  evidence.detail = detail ??
    "Semantic system inferred from module path and naming conventions";
  return evidence;
}

export function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const result: Evidence[] = [];
  for (const item of evidence) {
    const key = `${item.file}|${item.detail ?? ""}|${item.certainty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
