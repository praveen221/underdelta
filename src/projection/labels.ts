const PRODUCT_ACRONYMS = new Set([
  "ai",
  "api",
  "rag",
  "llm",
  "sql",
  "http",
  "https",
  "url",
  "uri",
  "id",
  "uuid",
  "jwt",
  "oauth",
  "db",
  "ui",
  "ux",
  "css",
  "html",
  "json",
  "xml",
  "aws",
  "gcp",
  "s3",
  "cdn",
  "sms",
  "gpu",
  "cpu",
  "io",
  "vpc",
  "nat",
  "eip",
  "dynamodb",
  "iam",
  "ec2",
  "ecs",
  "eks",
  "rds",
  "opentelemetry",
]);

const MIXED_CASE_ACRONYMS: Record<string, string> = {
  oauth: "OAuth",
  dynamodb: "DynamoDB",
  opentelemetry: "OpenTelemetry",
};

export function isProductAcronym(value: string): boolean {
  return PRODUCT_ACRONYMS.has(value.toLowerCase());
}

export function formatProductWord(part: string, index: number): string {
  const lower = part.toLowerCase();
  if (isProductAcronym(lower)) {
    return MIXED_CASE_ACRONYMS[lower] ?? lower.toUpperCase();
  }
  if (index === 0) {
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }
  return lower;
}

/** Turn camelCase / PascalCase / kebab identifiers into calm product words. */
export function humanizeIdentifierLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || /\s/.test(trimmed)) return trimmed;
  const spaced = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return trimmed;
  return spaced
    .split(" ")
    .map((part, index) => formatProductWord(part, index))
    .join(" ");
}

/** Canvas/inspector verb for a data story edge (`writes Article`, not `createArticle`). */
export function operationStoryLabel(
  kind: "queries" | "reads" | "writes",
  targetLabel: string,
  targetKind?: string,
): string {
  if (targetKind === "table" || targetKind === "collection") {
    const name = targetLabel.trim();
    return name ? `${kind} ${name}` : kind;
  }
  return kind;
}
