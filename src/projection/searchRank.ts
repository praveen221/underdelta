/** Viewer Find ranking. Exact table names beat same-label route groups. */
export function searchMatchScore(args: {
  query: string;
  label: string;
  kind: string;
  routeGroup?: boolean;
}): number {
  const query = args.query.trim().toLowerCase();
  const label = args.label.trim().toLowerCase();
  if (!query) return 0;
  let score = 40;
  if (label === query) score = 100;
  else if (label.startsWith(query)) score = 80;
  else if (label.includes(query)) score = 60;
  else return 0;
  if (args.kind === "table" || args.kind === "collection") {
    score += label === query ? 8 : 4;
  } else if (args.routeGroup) {
    score += 1;
  } else if (args.kind === "system" || args.kind === "pipeline") {
    score += 3;
  } else if (args.kind === "api" || args.kind === "service" || args.kind === "ui") {
    score += 2;
  } else if (
    args.kind === "function" ||
    args.kind === "column" ||
    args.kind === "module" ||
    args.kind === "pipeline-step"
  ) {
    score -= 1;
  }
  return score;
}
