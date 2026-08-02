import { edgeFrom, stableId } from "./graph.js";
import {
  architectureGraphSchema,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type EdgeKind,
  type Evidence,
  type NodeKind,
} from "./schema.js";

export interface PackageManifestHint {
  name?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  main?: string;
}

/** Weak label hint from a README heading that maps onto a path-role system key. */
export interface ReadmeHeadingHint {
  key: string;
  label: string;
  heading: string;
}

export interface ProjectOptions {
  packageManifest?: PackageManifestHint;
  /** Parsed README ##/### headings used only to humanize existing system labels. */
  readmeHints?: ReadmeHeadingHint[];
  /**
   * Cleaned README H1 title. Used as the product label when package.json name
   * is scoped/non-descriptive (e.g. `@api/source`).
   */
  readmeTitle?: string;
}

/**
 * Strip markdown image/link chrome from a heading so alt/link text can be used
 * as a human label. `![Alt](img.png)` → `Alt`.
 */
export function sanitizeMarkdownHeadingText(raw: string): string {
  let text = raw.trim();
  // Images: prefer alt text; drop empty-alt images entirely.
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  // Links: keep visible text.
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Leftover emphasis / code markers.
  text = text.replace(/[*_`~]/g, "").trim();
  // Collapse whitespace after removals.
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/** First H1 in a README, sanitized — product-title territory, not system hints. */
export function parseReadmeTitle(markdown: string): string | undefined {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown);
  if (!match?.[1]) return undefined;
  const title = sanitizeMarkdownHeadingText(
    match[1].replace(/\s+#+\s*$/, ""),
  );
  if (!title) return undefined;
  // Badges / bare URLs are not product names.
  if (/^https?:\/\//i.test(title)) return undefined;
  if (title.length > 80) return undefined;
  return title;
}

/**
 * Turn registry-style package names into founder-friendly product titles.
 * `fastapi-realworld-example-app` → `FastAPI RealWorld Example App`.
 */
export function humanizePackageName(name: string): string {
  const specials: Record<string, string> = {
    fastapi: "FastAPI",
    realworld: "RealWorld",
    nextjs: "Next.js",
    typescript: "TypeScript",
    graphql: "GraphQL",
    mongodb: "MongoDB",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    openai: "OpenAI",
  };
  return name
    .replace(/^@[^/]+\//, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (specials[lower]) return specials[lower];
      if (/^[a-z]+$/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join(" ");
}

/**
 * Prefer a human README title when package.json name is scoped or otherwise
 * unlikely to be the product name founders recognize (`@api/source`).
 * Hyphenated unscoped registry names are humanized for the North star user.
 */
export function preferProductLabel(
  packageName: string | undefined,
  readmeTitle: string | undefined,
  fallback: string,
): string {
  const pkg = packageName?.trim();
  if (pkg && !pkg.includes("/")) {
    return /[-_]/.test(pkg) ? humanizePackageName(pkg) : pkg;
  }
  if (readmeTitle) return readmeTitle;
  if (pkg) return humanizePackageName(pkg);
  const base = fallback.trim();
  return /[-_]/.test(base) ? humanizePackageName(base) : base;
}

interface SystemRole {
  key: string;
  label: string;
  kind: NodeKind;
}

/** Path-role defaults that are thin enough for README headings to refine. */
const thinSystemLabels = new Set([
  "HTTP API",
  "UI",
  "Data access",
  "Scheduled jobs",
  "Queue workers",
  "Pipelines",
]);

/**
 * Map a markdown heading onto a known system key. Returns undefined when the
 * heading is generic docs chrome (Status, License, …) or does not name a role.
 */
export function inferSystemKeyFromHeading(heading: string): string | undefined {
  const text = heading.trim().toLowerCase();
  if (!text) return undefined;

  // Skip common README scaffolding that should never rename product systems.
  if (
    /^(status|license|roadmap|near-term roadmap|try it|getting started|prerequisites?|environment variables?|install(?:ation)?|usage|contributing|changelog|design principles|overview|introduction|about|motivation)$/i.test(
      text,
    )
  ) {
    return undefined;
  }

  // Skip imperative how-to headings ("Generate your Prisma client", "Seed the database").
  if (
    /^(generate|install|run|create|configure|deploy|build|test|clone|download|add|update|set\s*up|make|enable|start|seed|apply|migrate|push|pull|open|visit|follow|copy|paste|replace|remove|delete|drop|reset)\b/.test(
      text,
    )
  ) {
    return undefined;
  }

  const rules: Array<{ key: string; pattern: RegExp; weight: number }> = [
    { key: "extractors", pattern: /\bextractors?\b/, weight: 10 },
    { key: "compile", pattern: /\bcompil(?:e|er|ation|ing)\b/, weight: 10 },
    { key: "pipelines", pattern: /\bpipelines?\b/, weight: 10 },
    { key: "workers", pattern: /\bworkers?\b|\bfulfillment\b/, weight: 9 },
    { key: "jobs", pattern: /\bjobs?\b|\bcron\b|\bscheduled\b/, weight: 9 },
    { key: "viewer", pattern: /\bviewer\b/, weight: 9 },
    { key: "schema", pattern: /\bschema\b/, weight: 9 },
    { key: "graph", pattern: /\bgraph\b|\bassembly\b/, weight: 8 },
    { key: "cli", pattern: /\bcli\b|\bcommand[- ]line\b/, weight: 8 },
    { key: "api", pattern: /\bapi\b|\broutes?\b|\bhttp\b|\bendpoints?\b/, weight: 8 },
    { key: "ui", pattern: /\bui\b|\bfrontend\b|\bstorefront\b|\bcomponents?\b/, weight: 7 },
    // "prisma"/"sql" alone match how-to noise; require data-ish phrasing.
    {
      key: "data",
      pattern:
        /\bdata(?:base)?\b|\bcatalog\b|\b(?:prisma|sql)\s+(?:models?|schema|data|layer|access)\b|\b(?:models?|schema)\s+(?:and|&|\/)\s+(?:migrations?|sql|prisma)\b/,
      weight: 7,
    },
  ];

  let best: { key: string; weight: number } | undefined;
  for (const rule of rules) {
    if (!rule.pattern.test(text)) continue;
    if (!best || rule.weight > best.weight) {
      best = { key: rule.key, weight: rule.weight };
    }
  }
  return best?.key;
}

/**
 * Parse markdown ##/### headings into weak system-label hints (first match wins
 * per key). H1 is reserved for the product title — using it as a system label
 * lets logo lines like `![Node/Express/Prisma…](logo.png)` hijack Data access.
 */
export function parseReadmeHeadingHints(markdown: string): ReadmeHeadingHint[] {
  const hints: ReadmeHeadingHint[] = [];
  const seen = new Set<string>();
  const headingRe = /^(#{2,3})\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(markdown)) !== null) {
    const raw = sanitizeMarkdownHeadingText(
      match[2]!.replace(/\s+#+\s*$/, ""),
    );
    if (!raw) continue;
    // Skip headings that are still image/badge chrome after sanitization.
    if (/^!\[/.test(raw) || /\]\([^)]+\)$/.test(raw)) continue;
    const key = inferSystemKeyFromHeading(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    hints.push({ key, label: raw, heading: raw });
  }
  return hints;
}

function applyReadmeHeadingHints(
  systems: Map<string, ArchitectureNode>,
  hints: ReadmeHeadingHint[] | undefined,
): void {
  if (!hints?.length) return;
  for (const hint of hints) {
    const system = systems.get(hint.key);
    if (!system) continue;
    const current = system.label;
    // Only refine thin path-role defaults — never let a longer how-to heading
    // win just because it mentions Prisma/SQL/API.
    const canRefine =
      thinSystemLabels.has(current) || current.toLowerCase() === hint.key;
    if (!canRefine) continue;
    if (current === hint.label) {
      system.metadata = {
        ...system.metadata,
        labelSource: "readme",
        readmeHeading: hint.heading,
      };
      continue;
    }
    system.label = hint.label;
    system.metadata = {
      ...system.metadata,
      labelSource: "readme",
      readmeHeading: hint.heading,
      pathRoleLabel: current,
    };
    system.evidence = dedupeEvidence([
      ...system.evidence,
      projectionEvidence(
        "README.md",
        `System label refined from README heading "${hint.heading}"`,
      ),
    ]);
  }
}

const preferredFlows: Array<[string, string]> = [
  ["cli", "compile"],
  ["compile", "extractors"],
  ["extractors", "graph"],
  ["compile", "artifact"],
  ["graph", "artifact"],
  ["artifact", "viewer"],
  ["artifact", "browser"],
  ["viewer", "browser"],
  ["schema", "graph"],
  ["schema", "extractors"],
  ["ui", "api"],
  ["api", "pipelines"],
  ["api", "workers"],
  ["api", "jobs"],
  ["api", "data"],
  ["jobs", "data"],
  ["pipelines", "data"],
  ["workers", "data"],
  ["viewer", "api"],
];

/**
 * Stable left-to-right Product flow preference when several systems become
 * ready in the same topological wave (e.g. pipelines/workers/jobs after API).
 * Underdelta compiler keys first; product-stack keys after.
 */
const flowOrderPreference: string[] = [
  "cli",
  "compile",
  "schema",
  "extractors",
  "graph",
  "artifact",
  "viewer",
  "browser",
  "ui",
  "api",
  "pipelines",
  "workers",
  "jobs",
  "data",
];

function flowOrderRank(key: string): number {
  const index = flowOrderPreference.indexOf(key);
  return index === -1 ? flowOrderPreference.length : index;
}

/** How product systems collaborate beyond the left-to-right flow band. */
const collaborationEdges: Array<{
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
  detail: string;
  /** When set, only emit if at least one of these system keys exists (gates commerce copy off bare API+Data maps). */
  requiresAny?: string[];
  /** When set, skip if any of these system keys exist (keeps neutral UI→API off commerce maps). */
  requiresNone?: string[];
}> = [
  {
    from: "cli",
    to: "compile",
    kind: "triggers",
    label: "scan",
    detail: "CLI scan command triggers the compile pipeline",
  },
  {
    from: "cli",
    to: "artifact",
    kind: "exposes",
    label: "architecture.json",
    detail: "CLI scan writes the architecture IR artifact",
  },
  {
    from: "cli",
    to: "browser",
    kind: "exposes",
    label: "index.html",
    detail: "CLI scan writes the self-contained browser artifact",
  },
  {
    from: "compile",
    to: "extractors",
    kind: "uses",
    label: "extract",
    detail: "Compile pipeline uses language extractors",
  },
  {
    from: "compile",
    to: "graph",
    kind: "uses",
    label: "assemble",
    detail: "Compile pipeline uses graph assembly",
  },
  {
    from: "compile",
    to: "schema",
    kind: "uses",
    label: "validate",
    detail: "Compile pipeline validates against the schema contract",
  },
  {
    from: "extractors",
    to: "schema",
    kind: "uses",
    label: "kinds",
    detail: "Extractors emit schema-shaped architecture nodes",
  },
  {
    from: "graph",
    to: "schema",
    kind: "uses",
    label: "contract",
    detail: "Graph assembly conforms to the schema contract",
  },
  {
    from: "schema",
    to: "extractors",
    kind: "configures",
    label: "shape",
    detail: "Schema contract configures extractor output shape",
  },
  {
    from: "schema",
    to: "graph",
    kind: "configures",
    label: "shape",
    detail: "Schema contract configures graph assembly shape",
  },
  {
    from: "viewer",
    to: "graph",
    kind: "renders",
    label: "graph",
    detail: "Viewer renders the assembled architecture graph",
  },
  {
    from: "viewer",
    to: "artifact",
    kind: "renders",
    label: "IR",
    detail: "Viewer renders architecture.json into the browser",
  },
  {
    from: "viewer",
    to: "browser",
    kind: "exposes",
    label: "index.html",
    detail: "Viewer emits the index.html browser artifact",
  },
  // Mini-stack / commerce product systems — collaboration beyond flows-to.
  // Gate on pipelines/workers only — Celery `jobs` alone (notes apps) must NOT
  // inherit Checkout/orders/payments copy or suppress neutral API→Data edges.
  {
    from: "ui",
    to: "api",
    kind: "uses",
    label: "checkout",
    detail: "Storefront UI uses Checkout API for order status and checkout",
    requiresAny: ["pipelines", "workers"],
  },
  {
    from: "api",
    to: "pipelines",
    kind: "triggers",
    label: "checkout",
    detail: "Checkout API triggers the Order pipeline after an order is accepted",
    requiresAny: ["pipelines", "workers"],
  },
  {
    from: "api",
    to: "workers",
    kind: "triggers",
    label: "fulfill",
    detail: "Checkout API triggers Fulfillment workers via the fulfillment queue",
    requiresAny: ["pipelines", "workers"],
  },
  {
    from: "api",
    to: "data",
    kind: "reads",
    label: "orders",
    detail: "Checkout API reads Catalog data when fulfilling orders",
    requiresAny: ["pipelines", "workers"],
  },
  {
    from: "jobs",
    to: "data",
    kind: "uses",
    label: "payments",
    detail: "Reconciliation jobs use Catalog data for payment reconciliation",
    requiresAny: ["pipelines", "workers"],
  },
  // Neutral UI→API collaboration for App Router / non-commerce products.
  {
    from: "ui",
    to: "api",
    kind: "uses",
    label: "fetch",
    detail: "UI calls the HTTP API and server actions",
    requiresNone: ["pipelines", "workers"],
  },
  // Neutral API→Data for SaaS / RealWorld / Celery-notes maps (commerce uses "orders").
  {
    from: "api",
    to: "data",
    kind: "uses",
    label: "query",
    detail: "HTTP API reads and writes product data",
    requiresNone: ["pipelines", "workers"],
  },
  // Neutral jobs→data for Celery / scheduled-task products without commerce.
  {
    from: "jobs",
    to: "data",
    kind: "uses",
    label: "sync",
    detail: "Scheduled jobs read and write product data",
    requiresNone: ["pipelines", "workers"],
  },
];

function assignFlowOrder(
  systems: Map<string, ArchitectureNode>,
  flowPairs: Array<[string, string]>,
): void {
  const keys = [...systems.keys()];
  const indegree = new Map(keys.map((key) => [key, 0]));
  const adjacency = new Map(keys.map((key) => [key, [] as string[]]));

  for (const [from, to] of flowPairs) {
    if (!systems.has(from) || !systems.has(to)) continue;
    adjacency.get(from)!.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }

  const queue = keys
    .filter((key) => (indegree.get(key) ?? 0) === 0)
    .sort((a, b) => flowOrderRank(a) - flowOrderRank(b) || a.localeCompare(b));
  const ordered: string[] = [];

  while (queue.length) {
    const key = queue.shift()!;
    ordered.push(key);
    for (const next of adjacency.get(key) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
        queue.sort(
          (a, b) => flowOrderRank(a) - flowOrderRank(b) || a.localeCompare(b),
        );
      }
    }
  }

  for (const key of keys) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  ordered.forEach((key, index) => {
    const node = systems.get(key);
    if (!node) return;
    node.metadata = {
      ...node.metadata,
      flowOrder: index,
    };
  });
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isFileModule(node: ArchitectureNode): boolean {
  return (
    node.kind === "module" &&
    /\.(?:[cm]?[jt]sx?|py)$/i.test(
      normalizePath(node.qualifiedName ?? node.label),
    )
  );
}

function modulePath(node: ArchitectureNode): string {
  return normalizePath(node.qualifiedName ?? node.label);
}

export function inferSystemRole(moduleFile: string): SystemRole | undefined {
  const file = normalizePath(moduleFile).toLowerCase();

  if (file.includes("/extractors/") || /(^|\/)extractor\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "extractors", label: "Extractors", kind: "system" };
  }
  if (/(^|\/)cli\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "cli", label: "CLI", kind: "system" };
  }
  if (/(^|\/)compile\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "compile", label: "Compile pipeline", kind: "pipeline" };
  }
  if (/(^|\/)viewer\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "viewer", label: "Viewer", kind: "ui" };
  }
  // Top-level `components/` / `ui/` (no leading slash) must match too —
  // Next fixtures often keep client widgets beside `app/`, not under `src/`.
  if (/(^|\/)(ui|components)\//.test(file)) {
    return { key: "ui", label: "UI", kind: "ui" };
  }
  if (/(^|\/)graph\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "graph", label: "Graph assembly", kind: "system" };
  }
  // Next.js App Router: route handlers + server actions are the API surface.
  // Include route-group files (app/(login)/actions.ts) and lib/**/actions.ts
  // payment helpers — not only the app/actions/ convention folder.
  if (
    file.includes("/app/api/") ||
    /(?:^|\/)(?:src\/)?app\/api\//.test(file) ||
    /(?:^|\/)(?:src\/)?app\/.*\/route\.[cm]?[jt]sx?$/.test(file) ||
    /(?:^|\/)(?:src\/)?app\/actions?\//.test(file) ||
    /(?:^|\/)(?:src\/)?app\/.*\/actions\.[cm]?[jt]sx?$/.test(file) ||
    /(^|\/)actions\.[cm]?[jt]sx?$/.test(file)
  ) {
    return { key: "api", label: "HTTP API", kind: "api" };
  }
  // Next.js App Router pages/layouts are the product UI (before generic /api/).
  if (
    /(?:^|\/)(?:src\/)?app\/(?:.+\/)?(page|layout|loading|error|template|default)\.[cm]?[jt]sx?$/.test(
      file,
    )
  ) {
    return { key: "ui", label: "UI", kind: "ui" };
  }
  if (
    /(^|\/)(server|app|routes?)\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/routes/") ||
    file.includes("/api/") ||
    // Python servers: Django urlpatterns + FastAPI APIRouter modules.
    /(^|\/)urls\.py$/.test(file) ||
    file.includes("/routers/")
  ) {
    return { key: "api", label: "HTTP API", kind: "api" };
  }
  if (
    /(^|\/)jobs?\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/jobs/") ||
    // Celery: tasks.py / celery.py / celery_app.py / tasks/ package
    /(^|\/)tasks\.py$/.test(file) ||
    file.includes("/tasks/") ||
    /(^|\/)celery(?:_app)?\.py$/.test(file) ||
    file.includes("/celery/")
  ) {
    return { key: "jobs", label: "Scheduled jobs", kind: "system" };
  }
  if (/(^|\/)workers?\.[cm]?[jt]sx?$/.test(file) || file.includes("/workers/")) {
    return { key: "workers", label: "Queue workers", kind: "system" };
  }
  if (
    /(^|\/)pipeline\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/pipelines/")
  ) {
    return { key: "pipelines", label: "Pipelines", kind: "pipeline" };
  }
  // Drizzle/ORM app schemas live under /db/ (e.g. lib/db/schema.ts). Classify
  // those as Data access BEFORE the bare schema.ts → Schema contract rule, or
  // SaaS starters project a fake "Schema contract" instead of tables under Data.
  // Also accept repo-root `db/` (Python Alembic fixtures) — not only `/db/`.
  if (
    /(^|\/)(db|database|orders|reconcile)\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/prisma/") ||
    /(^|\/)db\//.test(file) ||
    /(^|\/)database\//.test(file)
  ) {
    return { key: "data", label: "Data access", kind: "system" };
  }
  // Architecture / compiler schema modules (Underdelta src/schema.ts), not ORM.
  if (/(^|\/)schema\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "schema", label: "Schema contract", kind: "system" };
  }

  return undefined;
}

function projectionEvidence(file: string, detail?: string): Evidence {
  const evidence: Evidence = {
    file,
    extractor: "projection",
    certainty: "derived",
  };
  if (detail !== undefined) {
    evidence.detail = detail;
  } else {
    evidence.detail =
      "Semantic system inferred from module path and naming conventions";
  }
  return evidence;
}

function normalizeBinEntries(
  bin: PackageManifestHint["bin"],
): Array<{ name: string; path: string }> {
  if (!bin) return [];
  if (typeof bin === "string") {
    return [{ name: "cli", path: normalizePath(bin) }];
  }
  return Object.entries(bin).map(([name, entryPath]) => ({
    name,
    path: normalizePath(entryPath),
  }));
}

function guessSourceFromDist(entryPath: string): string {
  return normalizePath(entryPath)
    .replace(/^\.\//, "")
    .replace(/^dist\//, "src/")
    .replace(/\.js$/i, ".ts");
}

/** Language extractor module: `…/extractors/<id>.ts` (not the runner `extractor.ts`). */
function extractorIdFromModule(file: string): string | undefined {
  const match = normalizePath(file).match(
    /(?:^|\/)extractors\/([^/]+)\.[cm]?[jt]sx?$/i,
  );
  const id = match?.[1]?.toLowerCase();
  if (!id || id === "index") return undefined;
  return id;
}

const infraExtractorIds = new Set(["repository", "projection"]);

function dedupeEvidence(evidence: Evidence[]): Evidence[] {
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

function normalizeTableKey(label: string): string {
  let value = label.trim().toLowerCase();
  // Strip Postgres schema qualifiers so public.users merges with users.
  if (value.includes(".")) {
    value = value.slice(value.lastIndexOf(".") + 1);
  }
  if (value.endsWith("ies") && value.length > 3) {
    value = `${value.slice(0, -3)}y`;
  } else if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    value = value.slice(0, -1);
  }
  return value;
}

function normalizeColumnKey(label: string): string {
  return label.trim().replaceAll("_", "").toLowerCase();
}

function titleCaseSingular(label: string): string {
  const key = normalizeTableKey(label);
  if (!key) return label;
  // team_member → Team member (readable for non-coders; not Team_member).
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? `${part.charAt(0).toUpperCase()}${part.slice(1)}`
        : part.toLowerCase(),
    )
    .join(" ");
}

/**
 * Turn camelCase / PascalCase / kebab identifiers into calm product words.
 * `createPost` → `Create post`, `PostList` → `Post list`, `sign-in` → `Sign in`.
 */
export function humanizeIdentifierLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || /\s/.test(trimmed)) return trimmed;
  const spaced = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return trimmed;
  return spaced
    .split(" ")
    .map((part, index) =>
      index === 0
        ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
        : part.toLowerCase(),
    )
    .join(" ");
}

/**
 * App Router URL paths → product page labels for the North star non-coder.
 * `/dashboard/activity` → `Dashboard · Activity`, `/sign-in` → `Sign in`.
 */
export function humanizeAppPathLabel(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "Home";
  if (!trimmed.startsWith("/")) return trimmed;
  const segments = trimmed
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));
  if (!segments.length) return "Home";
  return segments.map((segment) => humanizeIdentifierLabel(segment)).join(" · ");
}

/**
 * HTTP route labels for the North star non-coder.
 * Parent system is already "HTTP API", so drop the redundant `/api` prefix and
 * path params: `GET` + `/api/articles/{slug}/comments` → `GET Articles comments`.
 */
export function humanizeHttpRouteLabel(method: string, path: string): string {
  const verb = method.trim() || "GET";
  let segments = path
    .trim()
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"))
    // Drop `{slug}`, `:id`, `<int:pk>` — params are noise beside the product noun.
    .filter((segment) => !/^[:{<]/.test(segment) && !segment.includes(":"));
  if (segments[0]?.toLowerCase() === "api") {
    segments = segments.slice(1);
  }
  if (!segments.length) return verb;
  // Sentence-case the path: Stripe checkout (not Stripe Checkout).
  const humanPath = segments
    .map((segment, index) => {
      const human = humanizeIdentifierLabel(segment);
      if (index === 0) return human;
      return human.charAt(0).toLowerCase() + human.slice(1);
    })
    .join(" ");
  return `${verb} ${humanPath}`;
}

/** @deprecated Prefer humanizeHttpRouteLabel — kept as a stable Next.js alias. */
export function humanizeNextRouteLabel(method: string, path: string): string {
  return humanizeHttpRouteLabel(method, path);
}

/**
 * Server-action export names → product mutations.
 * `checkoutAction` → `Checkout` (drop trailing factory `Action` chrome).
 */
export function humanizeServerActionLabel(label: string): string {
  return humanizeIdentifierLabel(label).replace(/\s+action$/i, "");
}

function isSqlFamilyTable(node: ArchitectureNode): boolean {
  return (
    node.technology === "sql" ||
    node.technology === "alembic" ||
    node.technology === "sqlalchemy"
  );
}

function preferredTableLabel(bucket: ArchitectureNode[]): string {
  const ranked = [...bucket].sort((a, b) => {
    const rankDiff = tableRank(b) - tableRank(a);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
  const best = ranked[0]!;
  if (best.technology === "prisma" && !best.metadata?.discoveredFromUsage) {
    return best.label;
  }
  if (isSqlFamilyTable(best)) {
    const raw = best.label.trim();
    // Keep `_ArticleToTag`-style join chrome so collapse can still see the `_`.
    if (raw.startsWith("_") || /(^|\.)_/.test(raw)) {
      return raw.includes(".")
        ? raw.slice(raw.lastIndexOf(".") + 1)
        : raw;
    }
    // Keep Alembic junction names (`articles_to_tags`) recognizable for collapse.
    if (/_to_/i.test(raw)) return raw;
    const titled = titleCaseSingular(best.label);
    // commentaries → Commentary via plural strip; product word is Comment.
    if (normalizeTableKey(titled) === "commentary") return "Comment";
    return titled;
  }
  return best.label;
}

function tableRank(node: ArchitectureNode): number {
  if (node.technology === "prisma" && !node.metadata?.discoveredFromUsage) {
    return 3;
  }
  // Alembic migrations outrank ORM/query-helper table declarations.
  if (node.technology === "sql" || node.technology === "alembic") return 2;
  if (node.technology === "sqlalchemy") return 2;
  if (node.metadata?.discoveredFromUsage) return 1;
  return 0;
}

/** Turn Prisma field chrome into product words for the default browser. */
function humanizeRelationField(label: string): string {
  switch (label) {
    case "favoritedBy":
      return "favorited by";
    case "followedBy":
      return "followed by";
    case "tagList":
      return "tags";
    default:
      return label;
  }
}

/**
 * Merge multiple Prisma field names on the same directed table pair into one
 * human label. `followedBy` + `following` → `follows` so User↔User reads as a
 * product story instead of ORM navigation chrome.
 */
function mergeRelationLabels(labels: Iterable<string>): string | undefined {
  const set = new Set<string>();
  for (const label of labels) {
    // Prior merges join with ` / ` — split so re-merge does not duplicate parts.
    for (const part of label.split(/\s*\/\s*/)) {
      const trimmed = part.trim();
      // Drop ORM/SQL chrome words — only product vocabulary stays.
      if (
        !trimmed ||
        trimmed === "depends-on" ||
        trimmed === "references"
      ) {
        continue;
      }
      set.add(trimmed);
    }
  }
  if (set.has("followedBy") && set.has("following")) {
    set.delete("followedBy");
    set.delete("following");
    set.add("follows");
  }
  // User→Article often has both 1:n authored posts and M2M favorites.
  if (set.has("articles") && set.has("favorites")) {
    set.delete("articles");
    set.add("authored");
  }
  if (set.size === 0) return undefined;
  return [...set]
    .map(humanizeRelationField)
    .sort((a, b) => a.localeCompare(b))
    .join(" / ");
}

/**
 * Prisma M2M join tables (`_ArticleToTag`, `_UserFavorites`) and dropped
 * explicit join aliases (`ArticleTags` → articletag) that only restate two
 * already-known Prisma models.
 */
function isJoinTableNoise(
  node: ArchitectureNode,
  prismaTableKeys: Set<string>,
): boolean {
  const label = node.label.trim();
  const sqlName = String(node.metadata?.sqlName ?? "");
  const aliasNames = Array.isArray(node.metadata?.aliases)
    ? (node.metadata.aliases as unknown[]).map((item) => String(item))
    : [];
  const candidates = [label, sqlName, ...aliasNames];
  if (
    candidates.some(
      (name) => name.trim().startsWith("_") || /(^|\.)_/.test(name.trim()),
    )
  ) {
    return true;
  }
  // Alembic/SQL junctions: followers_to_followings, articles_to_tags.
  if (candidates.some((name) => /_to_/i.test(name.trim()))) {
    return true;
  }
  // Extractor-marked FK-only tables (favorites) without Prisma models.
  if (node.metadata?.joinTableCandidate === true) {
    return true;
  }

  const sources = Array.isArray(node.metadata?.sources)
    ? (node.metadata.sources as string[])
    : node.technology
      ? [node.technology]
      : [];
  const sqlFamily = new Set(["sql", "alembic", "sqlalchemy"]);
  const sqlOnly =
    sources.length > 0 && sources.every((source) => sqlFamily.has(source));
  if (!sqlOnly || prismaTableKeys.size < 2) return false;

  const key = normalizeTableKey(label);
  // Skip if this already is (or unified with) a Prisma model.
  if (prismaTableKeys.has(key)) return false;

  const keys = [...prismaTableKeys];
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      if (key === `${keys[i]}${keys[j]}`) return true;
    }
  }
  return false;
}

function columnRank(node: ArchitectureNode): number {
  if (node.technology === "prisma" && node.metadata?.relation) return 4;
  if (node.technology === "prisma") return 3;
  if (node.technology === "sql") return 2;
  return 0;
}

/**
 * Collapse raw file modules into product-level systems and wire
 * system-to-system flows so the default map reads as architecture,
 * not a symbol inventory.
 */
export function projectSemanticArchitecture(
  graph: ArchitectureGraph,
  options: ProjectOptions = {},
): ArchitectureGraph {
  const nodes = new Map(
    graph.nodes.map((node) => [node.id, { ...node, evidence: [...node.evidence] }]),
  );
  const edges = new Map(
    graph.edges.map((edge) => [edge.id, { ...edge, evidence: [...edge.evidence] }]),
  );

  const product = [...nodes.values()].find((node) => node.kind === "product");
  if (!product) return graph;

  // Prefer a cleaned README H1 when package.json name is scoped/non-descriptive.
  if (options.readmeTitle) {
    const preferred = preferProductLabel(
      options.packageManifest?.name,
      options.readmeTitle,
      product.label,
    );
    if (preferred !== product.label) {
      product.metadata = {
        ...product.metadata,
        packageName: product.label,
        labelSource: "readme",
        readmeTitle: options.readmeTitle,
      };
      product.label = preferred;
      product.evidence = dedupeEvidence([
        ...product.evidence,
        projectionEvidence(
          "README.md",
          `Product label from README title "${options.readmeTitle}"`,
        ),
      ]);
      nodes.set(product.id, product);
    }
  }

  const systems = new Map<string, ArchitectureNode>();
  const moduleToSystem = new Map<string, string>();

  for (const node of [...nodes.values()]) {
    if (!isFileModule(node)) continue;
    const role = inferSystemRole(modulePath(node));
    if (!role) continue;

    const systemId = stableId("system", role.key);
    let system = systems.get(role.key);
    if (!system) {
      system = {
        id: systemId,
        kind: role.kind,
        label: role.label,
        technology: "semantic",
        metadata: {
          projection: "semantic",
          systemKey: role.key,
        },
        evidence: [projectionEvidence(modulePath(node))],
      };
      systems.set(role.key, system);
      nodes.set(system.id, system);
    } else {
      system.evidence.push(projectionEvidence(modulePath(node)));
    }

    moduleToSystem.set(node.id, system.id);
    node.parentId = system.id;
    node.metadata = {
      ...node.metadata,
      projectedSystem: role.key,
    };
    nodes.set(node.id, node);
  }

  if (systems.size === 0) return graph;

  for (const system of systems.values()) {
    system.evidence = dedupeEvidence(system.evidence);
    nodes.set(system.id, system);
  }

  // Product contains systems (not raw projected modules).
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (
      edge.kind === "contains" &&
      edge.source === product.id &&
      moduleToSystem.has(edge.target)
    ) {
      edges.delete(edgeId);
    }
  }

  for (const system of systems.values()) {
    const evidence = system.evidence[0]!;
    const productEdge = edgeFrom("contains", product.id, system.id, evidence);
    edges.set(productEdge.id, productEdge);

    for (const [moduleId, systemId] of moduleToSystem) {
      if (systemId !== system.id) continue;
      const moduleNode = nodes.get(moduleId);
      const moduleEvidence = moduleNode?.evidence[0] ?? evidence;
      const contains = edgeFrom(
        "contains",
        system.id,
        moduleId,
        moduleEvidence,
      );
      edges.set(contains.id, contains);
    }
  }

  const parentOf = new Map<string, string>();
  for (const node of nodes.values()) {
    if (node.parentId) parentOf.set(node.id, node.parentId);
  }
  for (const edge of edges.values()) {
    if (edge.kind === "contains") parentOf.set(edge.target, edge.source);
  }

  function owningModule(nodeId: string): string | undefined {
    let current: string | undefined = nodeId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (moduleToSystem.has(current)) return current;
      seen.add(current);
      current = parentOf.get(current);
    }
    return undefined;
  }

  function owningSystem(nodeId: string): string | undefined {
    const moduleId = owningModule(nodeId);
    return moduleId ? moduleToSystem.get(moduleId) : undefined;
  }

  function attachToSystem(
    nodeId: string,
    systemId: string,
    evidence: Evidence,
  ): void {
    const node = nodes.get(nodeId);
    if (!node) return;
    if (node.metadata?.projection === "semantic") return;
    node.parentId = systemId;
    nodes.set(nodeId, node);

    for (const [edgeId, edge] of [...edges.entries()]) {
      if (
        edge.kind === "contains" &&
        edge.target === nodeId &&
        edge.source !== systemId
      ) {
        edges.delete(edgeId);
      }
    }

    const contains = edgeFrom("contains", systemId, nodeId, evidence);
    edges.set(contains.id, contains);
    parentOf.set(nodeId, systemId);
  }

  // Lift high-signal runtime nodes under their owning product systems.
  for (const node of [...nodes.values()]) {
    if (node.metadata?.projection === "semantic") continue;
    const systemId = owningSystem(node.id);
    if (!systemId) continue;
    const evidence = node.evidence[0] ?? projectionEvidence(".");

    // Keep default-export page/layout implementations nested under their
    // App Router convention node so Home → HomePage does not flatten into UI.
    if (node.kind === "component" || node.kind === "function") {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (
        parent &&
        (parent.metadata?.next === "page" || parent.metadata?.next === "layout")
      ) {
        continue;
      }
    }

    if (
      node.kind === "route" ||
      node.kind === "cron" ||
      node.kind === "job" ||
      node.kind === "queue" ||
      node.kind === "component" ||
      node.kind === "page" ||
      node.kind === "hook" ||
      (node.kind === "pipeline" && node.technology !== "semantic") ||
      node.kind === "database" ||
      node.kind === "schema" ||
      // Server actions are the Posts/API story — nest under HTTP API, not modules.
      (node.kind === "function" && node.metadata?.serverAction === true)
    ) {
      attachToSystem(node.id, systemId, evidence);
    }
  }

  // When a Scheduled jobs system exists, nest every Celery/cron/job leaf under
  // it — beat schedules in celery_app.py and @shared_task in tasks.py share one story.
  const jobsSystem = systems.get("jobs");
  if (jobsSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind !== "cron" && node.kind !== "job") continue;
      if (node.metadata?.projection === "semantic") continue;
      attachToSystem(
        node.id,
        jobsSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }
  }

  // When an HTTP API system exists, nest every route under it — entrypoint
  // health checks (e.g. GET / in main.ts) sit outside /routes/ and would
  // otherwise leak onto the overview beside the product story.
  const apiSystem = systems.get("api");
  if (apiSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind !== "route") continue;
      if (node.metadata?.projection === "semantic") continue;
      attachToSystem(
        node.id,
        apiSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }
    // Same for server actions: saas-starter keeps them in app/(login)/actions.ts
    // and lib/payments/actions.ts, so path-role owningSystem often misses them.
    for (const node of [...nodes.values()]) {
      if (node.kind !== "function" || node.metadata?.serverAction !== true) {
        continue;
      }
      if (node.metadata?.projection === "semantic") continue;
      attachToSystem(
        node.id,
        apiSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }
  }

  // Nest extracted pipelines under the semantic Pipelines system.
  const pipelinesSystem = systems.get("pipelines");
  if (pipelinesSystem) {
    for (const node of [...nodes.values()]) {
      if (
        node.kind === "pipeline" &&
        node.metadata?.projection !== "semantic" &&
        node.id !== pipelinesSystem.id
      ) {
        attachToSystem(
          node.id,
          pipelinesSystem.id,
          node.evidence[0] ?? projectionEvidence("."),
        );
      }
    }
  }

  // Nest pipeline steps under their pipeline parent when available.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "contains") continue;
    const parent = nodes.get(edge.source);
    const child = nodes.get(edge.target);
    if (parent?.kind === "pipeline" && child?.kind === "pipeline-step") {
      child.parentId = parent.id;
      nodes.set(child.id, child);
    }
  }

  // Lift publishes/consumes onto owning systems and keep messaging hubs visible.
  const queueRoles = new Map<
    string,
    { publishers: Set<string>; consumers: Set<string> }
  >();

  function recordQueueRole(
    queueId: string,
    role: "publishers" | "consumers",
    systemId: string,
  ): void {
    const entry = queueRoles.get(queueId) ?? {
      publishers: new Set<string>(),
      consumers: new Set<string>(),
    };
    entry[role].add(systemId);
    queueRoles.set(queueId, entry);
  }

  for (const edge of [...edges.values()]) {
    if (edge.kind !== "publishes" && edge.kind !== "consumes") continue;
    const queue = nodes.get(edge.target);
    if (!queue || queue.kind !== "queue") continue;
    const systemId = owningSystem(edge.source);
    if (!systemId) continue;
    const role = edge.kind === "publishes" ? "publishers" : "consumers";
    recordQueueRole(queue.id, role, systemId);
    const lifted = edgeFrom(
      edge.kind,
      systemId,
      queue.id,
      {
        ...edge.evidence[0]!,
        extractor: "projection",
        certainty: "derived",
        detail: `Lifted ${edge.kind} onto product system`,
      },
      edge.label,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
  }

  // If API (or another system) calls a publisher, treat the caller as a publisher too.
  for (const edge of graph.edges) {
    if (edge.kind !== "calls" && edge.kind !== "imports") continue;
    const callerSystem = owningSystem(edge.source);
    if (!callerSystem) continue;
    for (const pub of edges.values()) {
      if (pub.kind !== "publishes" || pub.source !== edge.target) continue;
      const queue = nodes.get(pub.target);
      if (!queue || queue.kind !== "queue") continue;
      recordQueueRole(queue.id, "publishers", callerSystem);
      const lifted = edgeFrom(
        "publishes",
        callerSystem,
        queue.id,
        {
          ...pub.evidence[0]!,
          extractor: "projection",
          certainty: "inferred",
          detail: `Caller system publishes via ${edge.kind}`,
        },
      );
      if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
    }
  }

  for (const [queueId, roles] of queueRoles) {
    const queue = nodes.get(queueId);
    if (!queue) continue;
    queue.metadata = {
      ...queue.metadata,
      publishers: [...roles.publishers]
        .map((id) => nodes.get(id)?.label)
        .filter(Boolean),
      consumers: [...roles.consumers]
        .map((id) => nodes.get(id)?.label)
        .filter(Boolean),
      messagingHub: roles.publishers.size > 0 && roles.consumers.size > 0,
    };
    // Shared queues sit under workers when present, else stay with their owner.
    const workersSystem = systems.get("workers");
    if (workersSystem && roles.consumers.has(workersSystem.id)) {
      attachToSystem(
        queueId,
        workersSystem.id,
        queue.evidence[0] ?? projectionEvidence("."),
      );
    }
    nodes.set(queueId, queue);
  }

  // Cron schedules are the jobs story — keep them visible like messaging hubs.
  for (const node of nodes.values()) {
    if (node.kind !== "cron") continue;
    if (!node.metadata?.expression && !node.metadata?.handler) continue;
    node.metadata = {
      ...node.metadata,
      scheduleHub: true,
    };
    nodes.set(node.id, node);
  }

  // Hide leaves that only restate their parent semantic system on the overview.
  // Messaging hubs + cron schedules stay visible so automation reads without Details.
  const collapsibleKinds = new Set([
    "route",
    "component",
    "page",
    "hook",
    "cron",
    "job",
    "queue",
    "database",
    "schema",
    "pipeline",
    "function",
  ]);
  for (const node of nodes.values()) {
    if (node.metadata?.projection === "semantic") continue;
    if (!collapsibleKinds.has(node.kind)) continue;
    if (node.kind === "queue" && node.metadata?.messagingHub) continue;
    if (node.kind === "cron" && node.metadata?.scheduleHub) continue;
    // Only collapse server-action functions — raw handlers stay module-local.
    if (node.kind === "function" && node.metadata?.serverAction !== true) {
      continue;
    }
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent?.metadata?.projection === "semantic") {
      node.metadata = {
        ...node.metadata,
        collapsedInOverview: true,
      };
    }
  }

  // Quiet App Router / UI-kit chrome on overview: page children (Home page,
  // skeletons), layout widgets, and shadcn leaves restated the UI system.
  // Collapse every component leaf — the UI system (+ focus/Details) tells the story.
  for (const node of nodes.values()) {
    if (node.kind !== "component") continue;
    if (node.metadata?.projection === "semantic") continue;
    node.metadata = {
      ...node.metadata,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }

  // Quiet Python/JS file-module chrome once product systems exist — API + Data
  // (and UI) tell the story; modules stay available via Details/search.
  if (systems.size > 0) {
    for (const node of nodes.values()) {
      if (node.kind !== "module") continue;
      if (node.metadata?.projection === "semantic") continue;
      node.metadata = {
        ...node.metadata,
        collapsedInOverview: true,
      };
      nodes.set(node.id, node);
    }
  }

  // Humanize route/page/component chrome so the default browser reads as a
  // product story (Dashboard, Sign in, GET Articles) instead of paths/camelCase.
  for (const node of nodes.values()) {
    if (node.metadata?.projection === "semantic") continue;
    let nextLabel: string | undefined;

    if (node.kind === "page" && node.metadata?.next === "page") {
      const path =
        typeof node.metadata.path === "string" ? node.metadata.path : node.label;
      nextLabel = humanizeAppPathLabel(path);
    } else if (
      node.kind === "component" &&
      node.metadata?.next === "layout" &&
      typeof node.metadata.path === "string"
    ) {
      // Convention layout node (has App Router path) — not the default-export fn.
      nextLabel =
        node.metadata.path === "/"
          ? "App layout"
          : `${humanizeAppPathLabel(node.metadata.path)} layout`;
    } else if (
      node.kind === "route" &&
      typeof node.metadata?.path === "string" &&
      (node.metadata?.next === "route" ||
        node.metadata?.framework === "fastapi" ||
        node.metadata?.framework === "django" ||
        node.metadata.path.startsWith("/api/") ||
        node.metadata.path === "/api")
    ) {
      // Next/FastAPI/Django (+ /api/*): GET /api/articles/{slug} → GET Articles.
      const method =
        typeof node.metadata.method === "string" ? node.metadata.method : "GET";
      nextLabel = humanizeHttpRouteLabel(method, node.metadata.path);
    } else if (node.metadata?.serverAction === true) {
      // checkoutAction → Checkout (drop trailing Action factory chrome).
      nextLabel = humanizeServerActionLabel(node.label);
    } else if (node.kind === "job") {
      // Celery send_digest → Send digest
      nextLabel = humanizeIdentifierLabel(
        typeof node.metadata?.handler === "string"
          ? node.metadata.handler
          : node.label,
      );
    } else if (
      node.kind === "cron" &&
      typeof node.metadata?.handler === "string" &&
      typeof node.metadata?.expression === "string"
    ) {
      // Celery/node-cron: send_digest (0 * * * *) → Send digest (0 * * * *)
      nextLabel = `${humanizeIdentifierLabel(node.metadata.handler)} (${node.metadata.expression})`;
    } else if (node.kind === "component") {
      // All components (client + server): tame PascalCase Card*/skeletons too.
      nextLabel = humanizeIdentifierLabel(node.label);
    }

    if (!nextLabel || nextLabel === node.label) continue;
    node.metadata = {
      ...node.metadata,
      technicalLabel: node.label,
    };
    node.label = nextLabel;
    nodes.set(node.id, node);
  }

  // Auth + billing mutations are the SaaS product story beside UI→API→Data.
  // Keep them visible on overview like messaging/cron hubs (not buried in Details).
  const authBillingOverviewHubs = new Set([
    "Sign in",
    "Sign up",
    "Sign out",
    "Checkout",
    "Customer portal",
  ]);
  for (const node of nodes.values()) {
    if (node.metadata?.serverAction !== true) continue;
    if (!authBillingOverviewHubs.has(node.label)) continue;
    node.metadata = {
      ...node.metadata,
      overviewHub: true,
      collapsedInOverview: false,
    };
    nodes.set(node.id, node);
  }

  // Attach databases discovered only via Prisma/SQL files to Data access.
  const dataSystem = systems.get("data");
  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind === "database" || node.kind === "schema") {
        attachToSystem(
          node.id,
          dataSystem.id,
          node.evidence[0] ?? projectionEvidence("."),
        );
      }
    }
  }

  // Collapse duplicate table nodes (Order / order / orders) and polish names.
  const tablesByKey = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (node.kind !== "table") continue;
    const key = normalizeTableKey(node.label);
    const bucket = tablesByKey.get(key) ?? [];
    bucket.push(node);
    tablesByKey.set(key, bucket);
  }

  const redirect = new Map<string, string>();
  for (const [key, bucket] of tablesByKey) {
    const ranked = [...bucket].sort((a, b) => {
      const rankDiff = tableRank(b) - tableRank(a);
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = ranked[0]!;
    const aliases = [
      ...new Set(
        ranked
          .map((node) => node.label)
          .filter((label) => label !== preferredTableLabel(ranked)),
      ),
    ];
    const prismaName = ranked.find(
      (node) =>
        node.technology === "prisma" && !node.metadata?.discoveredFromUsage,
    )?.label;
    const sqlName = ranked.find((node) => isSqlFamilyTable(node))?.label ??
      (typeof ranked[0]?.metadata?.sqlName === "string"
        ? ranked[0].metadata.sqlName
        : undefined);
    const sources = [
      ...new Set(
        ranked
          .map((node) => node.technology)
          .filter((tech): tech is string => Boolean(tech)),
      ),
    ];
    canonical.label = preferredTableLabel(ranked);
    const joinCandidate = ranked.some(
      (node) => node.metadata?.joinTableCandidate === true,
    );
    canonical.metadata = {
      ...canonical.metadata,
      aliases,
      normalizedTable: key,
      ...(prismaName ? { prismaName } : {}),
      ...(sqlName ? { sqlName } : {}),
      sources,
      ...(joinCandidate ? { joinTableCandidate: true } : {}),
    };
    for (const duplicate of ranked.slice(1)) {
      for (const child of nodes.values()) {
        if (child.parentId === duplicate.id) {
          child.parentId = canonical.id;
          nodes.set(child.id, child);
        }
      }
      redirect.set(duplicate.id, canonical.id);
      canonical.evidence.push(...duplicate.evidence);
      nodes.delete(duplicate.id);
    }
    canonical.evidence = dedupeEvidence(canonical.evidence);
    nodes.set(canonical.id, canonical);
  }

  // Retarget edges before re-parenting so SQL→Prisma redirects do not
  // resurrect stale product/database contains links.
  for (const [edgeId, edge] of [...edges.entries()]) {
    const source = redirect.get(edge.source) ?? edge.source;
    const target = redirect.get(edge.target) ?? edge.target;
    if (!nodes.has(source) || !nodes.has(target)) {
      edges.delete(edgeId);
      continue;
    }
    if (source === edge.source && target === edge.target) continue;
    edges.delete(edgeId);
    if (source === target) continue;
    const retargeted = edgeFrom(
      edge.kind,
      source,
      target,
      edge.evidence[0]!,
      edge.label,
    );
    edges.set(retargeted.id, retargeted);
  }

  // Nest unified tables under Data access and keep migration edges intact.
  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind !== "table") continue;
      attachToSystem(
        node.id,
        dataSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }

    // Overview: when Catalog data already has tables, hide Prisma database /
    // SQL migration schema leaves — tables tell the data story. (Attach to
    // dataSystem happens after the general leaf-collapse pass, so mark here.)
    const hasTables = [...nodes.values()].some(
      (node) => node.kind === "table" && node.parentId === dataSystem.id,
    );
    if (hasTables) {
      for (const node of nodes.values()) {
        if (
          (node.kind === "database" || node.kind === "schema") &&
          node.parentId === dataSystem.id
        ) {
          node.metadata = {
            ...node.metadata,
            collapsedInOverview: true,
          };
          nodes.set(node.id, node);
        }
      }
    }
  }

  // Collapse duplicate columns (created_at / createdAt, order_id / orderId).
  const columnsByTable = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (node.kind !== "column" || !node.parentId) continue;
    const bucket = columnsByTable.get(node.parentId) ?? [];
    bucket.push(node);
    columnsByTable.set(node.parentId, bucket);
  }
  const columnRedirect = new Map<string, string>();
  for (const [tableId, columns] of columnsByTable) {
    const byKey = new Map<string, ArchitectureNode[]>();
    for (const column of columns) {
      const key = normalizeColumnKey(column.label);
      const bucket = byKey.get(key) ?? [];
      bucket.push(column);
      byKey.set(key, bucket);
    }
    for (const [key, bucket] of byKey) {
      if (bucket.length < 2) continue;
      const ranked = [...bucket].sort((a, b) => {
        const rankDiff = columnRank(b) - columnRank(a);
        if (rankDiff !== 0) return rankDiff;
        // Prefer camelCase Prisma-style labels over snake_case.
        const camelDiff =
          Number(b.label.includes("_") ? 0 : 1) -
          Number(a.label.includes("_") ? 0 : 1);
        if (camelDiff !== 0) return camelDiff;
        return a.id.localeCompare(b.id);
      });
      const canonical = ranked[0]!;
      canonical.metadata = {
        ...canonical.metadata,
        aliases: ranked.slice(1).map((node) => node.label),
        normalizedColumn: key,
      };
      for (const duplicate of ranked.slice(1)) {
        columnRedirect.set(duplicate.id, canonical.id);
        canonical.evidence.push(...duplicate.evidence);
        nodes.delete(duplicate.id);
      }
      canonical.evidence = dedupeEvidence(canonical.evidence);
      canonical.parentId = tableId;
      nodes.set(canonical.id, canonical);
    }
  }

  for (const [edgeId, edge] of [...edges.entries()]) {
    const source = columnRedirect.get(edge.source) ?? edge.source;
    const target = columnRedirect.get(edge.target) ?? edge.target;
    if (!nodes.has(source) || !nodes.has(target)) {
      edges.delete(edgeId);
      continue;
    }
    if (source === edge.source && target === edge.target) continue;
    edges.delete(edgeId);
    if (source === target) continue;
    const retargeted = edgeFrom(
      edge.kind,
      source,
      target,
      edge.evidence[0]!,
      edge.label,
    );
    edges.set(retargeted.id, retargeted);
  }

  // Keep one table↔table relation edge per directed pair. When Prisma exposes
  // multiple field names (articles + favorites), merge labels so favorites /
  // follows stay on the data story instead of being dropped by dedupe.
  const tableIds = new Set(
    [...nodes.values()].filter((node) => node.kind === "table").map((n) => n.id),
  );
  const relationBest = new Map<string, ArchitectureEdge>();
  const relationLabels = new Map<string, Set<string>>();
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (edge.kind !== "depends-on") continue;
    if (!tableIds.has(edge.source) || !tableIds.has(edge.target)) continue;
    const pairKey = `${edge.source}->${edge.target}`;
    const labels = relationLabels.get(pairKey) ?? new Set<string>();
    if (edge.label) labels.add(edge.label);
    relationLabels.set(pairKey, labels);
    const existing = relationBest.get(pairKey);
    const score =
      (edge.label && edge.label !== "references" ? 2 : 0) +
      (edge.evidence.some((item) => item.extractor === "prisma") ? 1 : 0);
    const existingScore = existing
      ? (existing.label && existing.label !== "references" ? 2 : 0) +
        (existing.evidence.some((item) => item.extractor === "prisma") ? 1 : 0)
      : -1;
    if (!existing || score > existingScore) {
      if (existing) edges.delete(existing.id);
      relationBest.set(pairKey, edge);
    } else {
      edges.delete(edgeId);
    }
  }
  for (const [pairKey, edge] of relationBest) {
    const merged = mergeRelationLabels(relationLabels.get(pairKey) ?? []);
    if (!merged || merged === edge.label) continue;
    edges.delete(edge.id);
    const relabeled = edgeFrom(
      edge.kind,
      edge.source,
      edge.target,
      edge.evidence[0]!,
      merged,
    );
    relabeled.evidence = dedupeEvidence([
      ...edge.evidence,
      projectionEvidence(
        edge.evidence[0]?.file ?? ".",
        `Merged relation labels: ${merged}`,
      ),
    ]);
    edges.set(relabeled.id, relabeled);
    relationBest.set(pairKey, relabeled);
  }

  // Relation-only Prisma fields (order / payments) are ORM navigation, not
  // schema columns. Collapse them on the default map; table↔table edges remain.
  for (const node of nodes.values()) {
    if (node.kind !== "column" || !node.metadata?.relation) continue;
    node.metadata = {
      ...node.metadata,
      relationOnly: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }

  // Prisma implicit M2M join tables (`_ArticleToTag`) and obsolete SQL join
  // aliases (`ArticleTags`) restate many-to-many edges. Collapse them on the
  // default map; real models (Article/Tag/User) carry the data story.
  const prismaTableKeys = new Set(
    [...nodes.values()]
      .filter(
        (node) =>
          node.kind === "table" &&
          (node.technology === "prisma" ||
            (Array.isArray(node.metadata?.sources) &&
              (node.metadata.sources as string[]).includes("prisma"))),
      )
      .map((node) => normalizeTableKey(String(node.metadata?.prismaName ?? node.label))),
  );
  const joinTableIds = new Set<string>();
  for (const node of [...nodes.values()]) {
    if (node.kind !== "table") continue;
    if (!isJoinTableNoise(node, prismaTableKeys)) continue;
    joinTableIds.add(node.id);
    node.metadata = {
      ...node.metadata,
      joinTable: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
    for (const child of nodes.values()) {
      if (child.parentId !== node.id || child.kind !== "column") continue;
      child.metadata = {
        ...child.metadata,
        joinTable: true,
        collapsedInOverview: true,
      };
      nodes.set(child.id, child);
    }
  }

  // Lift Alembic/SQL M2M join tables into product relations before dropping
  // their FK edges — otherwise favorites/follows/tags vanish from the story.
  if (joinTableIds.size > 0) {
    const productTables = [...nodes.values()].filter(
      (node) => node.kind === "table" && !joinTableIds.has(node.id),
    );
    const tableByNorm = new Map<string, ArchitectureNode>();
    for (const table of productTables) {
      tableByNorm.set(normalizeTableKey(table.label), table);
      const sqlName = table.metadata?.sqlName;
      if (typeof sqlName === "string" && sqlName.trim()) {
        tableByNorm.set(normalizeTableKey(sqlName), table);
      }
    }
    const resolveFkTable = (raw: string): ArchitectureNode | undefined =>
      tableByNorm.get(normalizeTableKey(raw));

    const addProductRelation = (
      source: ArchitectureNode,
      target: ArchitectureNode,
      label: string,
      evidence: Evidence,
    ) => {
      const liftEvidence: Evidence = {
        ...evidence,
        extractor: "projection",
        certainty: "derived",
        detail: `Lifted join relation: ${label}`,
      };
      // Merge into any existing directed pair so Prisma favorites/follows are
      // not duplicated when the SQL join table is also collapsed.
      for (const existing of [...edges.values()]) {
        if (existing.kind !== "depends-on") continue;
        if (existing.source !== source.id || existing.target !== target.id) {
          continue;
        }
        const merged =
          mergeRelationLabels([existing.label ?? "", label]) ?? label;
        if (merged !== existing.label) {
          edges.delete(existing.id);
          const relabeled = edgeFrom(
            existing.kind,
            existing.source,
            existing.target,
            existing.evidence[0] ?? liftEvidence,
            merged,
          );
          relabeled.evidence = dedupeEvidence([
            ...existing.evidence,
            liftEvidence,
          ]);
          edges.set(relabeled.id, relabeled);
        } else {
          existing.evidence = dedupeEvidence([
            ...existing.evidence,
            liftEvidence,
          ]);
          edges.set(existing.id, existing);
        }
        return;
      }
      const edge = edgeFrom(
        "depends-on",
        source.id,
        target.id,
        liftEvidence,
        label,
      );
      edges.set(edge.id, edge);
    };

    for (const joinId of joinTableIds) {
      const join = nodes.get(joinId);
      if (!join) continue;
      const joinName = String(join.metadata?.sqlName ?? join.label);
      const joinKey = normalizeTableKey(joinName);
      const evidence = join.evidence[0] ?? projectionEvidence(".");
      const fkTargets = [...nodes.values()]
        .filter(
          (node) =>
            node.parentId === joinId &&
            node.kind === "column" &&
            typeof node.metadata?.foreignKeyTable === "string",
        )
        .map((node) => ({
          column: node.label,
          table: resolveFkTable(String(node.metadata?.foreignKeyTable)),
        }))
        .filter(
          (item): item is { column: string; table: ArchitectureNode } =>
            Boolean(item.table),
        );

      if (/favorite/i.test(joinKey) || /favorite/i.test(join.label)) {
        const user = fkTargets.find(
          (item) => normalizeTableKey(item.table.label) === "user",
        )?.table;
        const article = fkTargets.find(
          (item) => normalizeTableKey(item.table.label) === "article",
        )?.table;
        if (user && article) {
          addProductRelation(user, article, "favorites", evidence);
          addProductRelation(article, user, "favorited by", evidence);
        }
        continue;
      }

      if (/follow/i.test(joinKey) || /follow/i.test(join.label)) {
        const user = tableByNorm.get("user");
        if (user) {
          addProductRelation(user, user, "follows", evidence);
        }
        continue;
      }

      if (/tag/i.test(joinKey) || /tag/i.test(join.label)) {
        const tag = fkTargets.find(
          (item) => normalizeTableKey(item.table.label) === "tag",
        )?.table;
        // Article↔Tag (RealWorld) or Note↔Tag (mini-python) — any non-tag
        // product table on the junction owns the "tags" story edge.
        const tagged = fkTargets.find(
          (item) =>
            item.table.id !== tag?.id &&
            normalizeTableKey(item.table.label) !== "tag",
        )?.table;
        if (tagged && tag) {
          addProductRelation(tagged, tag, "tags", evidence);
        }
      }
    }

    // Drop FK edges into/out of collapsed join tables — product models now
    // carry favorites/follows/tags; join "references" edges only confuse.
    for (const [edgeId, edge] of [...edges.entries()]) {
      if (edge.kind !== "depends-on") continue;
      if (joinTableIds.has(edge.source) || joinTableIds.has(edge.target)) {
        edges.delete(edgeId);
      }
    }
  }

  // Humanize remaining SQL FK "references" into product words + reverse
  // authored edges so Article↔User reads like the Express RealWorld map.
  {
    const productTableById = new Map(
      [...nodes.values()]
        .filter(
          (node) => node.kind === "table" && node.metadata?.joinTable !== true,
        )
        .map((node) => [node.id, node] as const),
    );
    const fkColumnFromDetail = (edge: ArchitectureEdge): string => {
      for (const item of edge.evidence) {
        const match = /FOREIGN KEY\s+(\w+)/i.exec(item.detail ?? "");
        if (match?.[1]) return match[1];
      }
      return "";
    };
    for (const edge of [...edges.values()]) {
      if (edge.kind !== "depends-on") continue;
      const source = productTableById.get(edge.source);
      const target = productTableById.get(edge.target);
      if (!source || !target) continue;
      const column = fkColumnFromDetail(edge);
      let productWord: string | undefined;
      if (column === "author_id") {
        productWord = "author";
      } else if (column === "article_id" && /comment/i.test(source.label)) {
        productWord = "on";
      } else if (
        (!edge.label ||
          edge.label === "references" ||
          edge.label === "depends-on") &&
        column.endsWith("_id")
      ) {
        productWord = humanizeIdentifierLabel(column.slice(0, -3));
      }
      let label = edge.label;
      if (productWord) {
        label =
          mergeRelationLabels([edge.label ?? "", productWord]) ?? productWord;
      }
      if (label && label !== edge.label) {
        edges.delete(edge.id);
        const relabeled = edgeFrom(
          edge.kind,
          edge.source,
          edge.target,
          edge.evidence[0]!,
          label,
        );
        relabeled.evidence = dedupeEvidence(edge.evidence);
        edges.set(relabeled.id, relabeled);
      }
      // Article/Note -author→ User also implies User -authored→ Article/Note.
      const sourceKey = normalizeTableKey(source.label);
      if (
        label &&
        /\bauthor\b/i.test(label) &&
        (sourceKey === "article" || sourceKey === "note") &&
        normalizeTableKey(target.label) === "user"
      ) {
        const reverseEvidence: Evidence = {
          ...(edge.evidence[0] ?? projectionEvidence(".")),
          extractor: "projection",
          certainty: "derived",
          detail: "Reverse of author FK for product story",
        };
        let mergedIntoExisting = false;
        for (const existing of [...edges.values()]) {
          if (existing.kind !== "depends-on") continue;
          if (existing.source !== target.id || existing.target !== source.id) {
            continue;
          }
          const merged =
            mergeRelationLabels([existing.label ?? "", "authored"]) ??
            "authored";
          if (merged !== existing.label) {
            edges.delete(existing.id);
            const relabeled = edgeFrom(
              existing.kind,
              existing.source,
              existing.target,
              existing.evidence[0] ?? reverseEvidence,
              merged,
            );
            relabeled.evidence = dedupeEvidence([
              ...existing.evidence,
              reverseEvidence,
            ]);
            edges.set(relabeled.id, relabeled);
          }
          mergedIntoExisting = true;
          break;
        }
        if (!mergedIntoExisting) {
          const authored = edgeFrom(
            "depends-on",
            target.id,
            source.id,
            reverseEvidence,
            "authored",
          );
          edges.set(authored.id, authored);
        }
      }
    }
  }

  // Lift cross-system imports/calls into system dependencies.
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") continue;
    const sourceSystem = owningSystem(edge.source);
    const targetSystem = owningSystem(edge.target);
    if (!sourceSystem || !targetSystem || sourceSystem === targetSystem) {
      continue;
    }
    const dependency = edgeFrom(
      "depends-on",
      sourceSystem,
      targetSystem,
      {
        ...edge.evidence[0]!,
        extractor: "projection",
        certainty: "derived",
        detail: `Lifted from ${edge.kind}`,
      },
    );
    if (!edges.has(dependency.id)) edges.set(dependency.id, dependency);
  }

  // Synthesize scan output artifacts on tooling self-maps:
  // architecture.json (IR) beside index.html (browser).
  if (
    (systems.has("compile") || systems.has("graph")) &&
    (systems.has("viewer") || systems.has("cli"))
  ) {
    const artifactId = stableId("system", "artifact");
    const artifact: ArchitectureNode = {
      id: artifactId,
      kind: "config",
      label: "architecture.json",
      technology: "underdelta",
      metadata: {
        projection: "semantic",
        systemKey: "artifact",
        role: "artifact",
        artifactKind: "architecture-ir",
      },
      evidence: [
        {
          file: ".underdelta/architecture.json",
          extractor: "projection",
          certainty: "derived",
          detail: "Compiled portable architecture IR written by underdelta scan",
        },
      ],
    };
    systems.set("artifact", artifact);
    nodes.set(artifact.id, artifact);
    const productEdge = edgeFrom(
      "contains",
      product.id,
      artifact.id,
      artifact.evidence[0]!,
    );
    edges.set(productEdge.id, productEdge);

    const browserId = stableId("system", "browser");
    const browser: ArchitectureNode = {
      id: browserId,
      kind: "config",
      label: "index.html",
      technology: "underdelta",
      metadata: {
        projection: "semantic",
        systemKey: "browser",
        role: "artifact",
        artifactKind: "browser",
      },
      evidence: [
        {
          file: ".underdelta/index.html",
          extractor: "projection",
          certainty: "derived",
          detail:
            "Self-contained architecture browser written by underdelta scan/render",
        },
      ],
    };
    systems.set("browser", browser);
    nodes.set(browser.id, browser);
    const browserProductEdge = edgeFrom(
      "contains",
      product.id,
      browser.id,
      browser.evidence[0]!,
    );
    edges.set(browserProductEdge.id, browserProductEdge);
  }

  const systemsByKey = new Map(
    [...systems.entries()].map(([key, node]) => [key, node.id]),
  );
  for (const [fromKey, toKey] of preferredFlows) {
    const from = systemsByKey.get(fromKey);
    const to = systemsByKey.get(toKey);
    if (!from || !to) continue;
    const flow = edgeFrom(
      "flows-to",
      from,
      to,
      {
        file: ".",
        extractor: "projection",
        certainty: "inferred",
        detail: `Preferred product flow ${fromKey} → ${toKey}`,
      },
      `${fromKey} → ${toKey}`,
    );
    if (!edges.has(flow.id)) edges.set(flow.id, flow);
  }

  // Collaboration edges describe how systems work together (uses/renders/…),
  // complementary to the left-to-right flows-to story band.
  for (const collab of collaborationEdges) {
    const from = systemsByKey.get(collab.from);
    const to = systemsByKey.get(collab.to);
    if (!from || !to) continue;
    if (
      collab.requiresAny &&
      !collab.requiresAny.some((key) => systemsByKey.has(key))
    ) {
      continue;
    }
    if (
      collab.requiresNone &&
      collab.requiresNone.some((key) => systemsByKey.has(key))
    ) {
      continue;
    }
    const edge = edgeFrom(
      collab.kind,
      from,
      to,
      {
        file: ".",
        extractor: "projection",
        certainty: "inferred",
        detail: collab.detail,
      },
      collab.label,
    );
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  }

  // Project package.json bin / exports into the product map.
  const manifest = options.packageManifest;
  if (manifest) {
    const binEntries = normalizeBinEntries(manifest.bin);
    if (binEntries.length > 0) {
      let cli = systems.get("cli");
      if (!cli) {
        cli = {
          id: stableId("system", "cli"),
          kind: "system",
          label: "CLI",
          technology: "semantic",
          metadata: {
            projection: "semantic",
            systemKey: "cli",
          },
          evidence: [],
        };
        systems.set("cli", cli);
        nodes.set(cli.id, cli);
        const productEdge = edgeFrom(
          "contains",
          product.id,
          cli.id,
          projectionEvidence(
            "package.json",
            "CLI inferred from package.json bin",
          ),
        );
        edges.set(productEdge.id, productEdge);
      }

      cli.metadata = {
        ...cli.metadata,
        binCommands: binEntries.map((entry) => entry.name),
        binEntries: Object.fromEntries(
          binEntries.map((entry) => [entry.name, entry.path]),
        ),
      };

      for (const entry of binEntries) {
        cli.evidence.push(
          projectionEvidence(
            "package.json",
            `bin.${entry.name} → ${entry.path}`,
          ),
        );
        const sourceGuess = guessSourceFromDist(entry.path);
        for (const node of nodes.values()) {
          if (!isFileModule(node)) continue;
          const file = modulePath(node);
          if (file !== sourceGuess && file !== normalizePath(entry.path)) {
            continue;
          }
          moduleToSystem.set(node.id, cli.id);
          node.parentId = cli.id;
          node.metadata = {
            ...node.metadata,
            projectedSystem: "cli",
            packageBin: entry.name,
          };
          nodes.set(node.id, node);
          const contains = edgeFrom(
            "contains",
            cli.id,
            node.id,
            projectionEvidence(
              "package.json",
              `package bin ${entry.name} maps to ${file}`,
            ),
          );
          edges.set(contains.id, contains);
        }
        const exposes = edgeFrom(
          "exposes",
          product.id,
          cli.id,
          projectionEvidence(
            "package.json",
            `package exposes CLI command ${entry.name}`,
          ),
          entry.name,
        );
        edges.set(exposes.id, exposes);
      }
      nodes.set(cli.id, cli);
    }

    if (manifest.exports !== undefined || manifest.main !== undefined) {
      product.metadata = {
        ...product.metadata,
        packageExports: manifest.exports ?? null,
        packageMain: manifest.main ?? null,
      };
      product.evidence = dedupeEvidence([
        ...product.evidence,
        projectionEvidence(
          "package.json",
          "Package entrypoints declared in package.json",
        ),
      ]);
      nodes.set(product.id, product);
    }
  }

  // Weak README heading hints: refine thin path-role labels with human names
  // from docs. Never invent systems from README alone.
  applyReadmeHeadingHints(systems, options.readmeHints);

  // Queue publisher/consumer lists were snapshotted before README rename.
  // Rebuild labels from lifted publishes/consumes so Messaging shows
  // "Checkout API" / "Fulfillment workers", not thin path-role defaults.
  for (const node of nodes.values()) {
    if (node.kind !== "queue" && node.kind !== "topic") continue;
    const publishers = new Set<string>();
    const consumers = new Set<string>();
    for (const edge of edges.values()) {
      if (edge.target !== node.id) continue;
      if (edge.kind !== "publishes" && edge.kind !== "consumes") continue;
      const source = nodes.get(edge.source);
      if (!source || source.metadata?.projection !== "semantic") continue;
      if (edge.kind === "publishes") publishers.add(source.label);
      else consumers.add(source.label);
    }
    if (!publishers.size && !consumers.size) continue;
    node.metadata = {
      ...node.metadata,
      publishers: [...publishers].sort((a, b) => a.localeCompare(b)),
      consumers: [...consumers].sort((a, b) => a.localeCompare(b)),
      messagingHub: publishers.size > 0 && consumers.size > 0,
    };
    nodes.set(node.id, node);
  }

  assignFlowOrder(systems, preferredFlows);

  // Surface the language-extractor roster on the Extractors system so the
  // default map answers "which extractors power this architecture?"
  const extractorsSystem = systems.get("extractors");
  if (extractorsSystem) {
    const rosterById = new Map<string, string>();
    for (const [moduleId, systemId] of moduleToSystem) {
      if (systemId !== extractorsSystem.id) continue;
      const moduleNode = nodes.get(moduleId);
      if (!moduleNode) continue;
      const file = modulePath(moduleNode);
      const extractorId = extractorIdFromModule(file);
      if (!extractorId) continue;
      rosterById.set(extractorId, file);
    }
    for (const registered of graph.extractors) {
      if (infraExtractorIds.has(registered.id)) continue;
      if (rosterById.has(registered.id)) continue;
      rosterById.set(registered.id, `src/extractors/${registered.id}.ts`);
    }
    const roster = [...rosterById.entries()]
      .map(([id, file]) => ({ id, file }))
      .sort((a, b) => a.id.localeCompare(b.id));

    extractorsSystem.metadata = {
      ...extractorsSystem.metadata,
      extractorRoster: roster.map((item) => item.id),
    };

    for (const item of roster) {
      const childId = stableId("extractor", item.id);
      if (nodes.has(childId)) continue;
      const child: ArchitectureNode = {
        id: childId,
        kind: "service",
        label: item.id,
        technology: item.id,
        parentId: extractorsSystem.id,
        metadata: {
          role: "extractor",
          extractorId: item.id,
          projectedSystem: "extractors",
          collapsedInOverview: true,
        },
        evidence: [
          projectionEvidence(
            item.file,
            `${item.id} language extractor on the Extractors roster`,
          ),
        ],
      };
      nodes.set(childId, child);
      const contains = edgeFrom(
        "contains",
        extractorsSystem.id,
        childId,
        child.evidence[0]!,
      );
      edges.set(contains.id, contains);
      extractorsSystem.evidence.push(child.evidence[0]!);
    }
    extractorsSystem.evidence = dedupeEvidence(extractorsSystem.evidence);
    nodes.set(extractorsSystem.id, extractorsSystem);
  }

  // Surface key source files on every semantic system for the inspector.
  for (const system of systems.values()) {
    const keyFiles: string[] = [];
    for (const item of system.evidence) {
      if (item.file && item.file !== ".") keyFiles.push(normalizePath(item.file));
    }
    for (const [moduleId, systemId] of moduleToSystem) {
      if (systemId !== system.id) continue;
      const moduleNode = nodes.get(moduleId);
      if (moduleNode) keyFiles.push(modulePath(moduleNode));
    }
    // Prefer language-extractor modules first on the Extractors system.
    const unique = [...new Set(keyFiles)];
    if (system.metadata?.systemKey === "extractors") {
      unique.sort((a, b) => {
        const aExtractor = extractorIdFromModule(a) ? 0 : 1;
        const bExtractor = extractorIdFromModule(b) ? 0 : 1;
        if (aExtractor !== bExtractor) return aExtractor - bExtractor;
        return a.localeCompare(b);
      });
    }
    system.metadata = {
      ...system.metadata,
      keyFiles: unique.slice(0, 12),
    };
    system.evidence = dedupeEvidence(system.evidence);
    nodes.set(system.id, system);
  }

  const projected: ArchitectureGraph = {
    ...graph,
    project: {
      ...graph.project,
      name: product.label,
    },
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [
      ...graph.diagnostics,
      {
        severity: "info",
        code: "semantic-projection",
        message: `Projected ${systems.size} product system(s) from module paths`,
      },
    ],
  };

  return architectureGraphSchema.parse(projected);
}
