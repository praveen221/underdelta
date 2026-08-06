import { detectionSurfacesForExtractor } from "./capabilitySurfaces.js";
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
  // HTML <img> — drop entirely (src="http://…" must not match the api http rule).
  text = text.replace(/<img\b[^>]*>/gi, " ");
  // Other HTML tags: keep inner text when present.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  // Leftover emphasis / code markers.
  text = text.replace(/[*_`~]/g, "").trim();
  // Collapse whitespace after removals.
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/** First H1 in a README, sanitized — product-title territory, not system hints. */
export function parseReadmeTitle(markdown: string): string | undefined {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown);
  if (match?.[1]) {
    const title = sanitizeMarkdownHeadingText(
      match[1].replace(/\s+#+\s*$/, ""),
    );
    if (
      title &&
      !/^https?:\/\//i.test(title) &&
      title.length <= 80
    ) {
      return title;
    }
  }

  // No usable H1 — accept a leading bold brand used as the product name
  // (`**Online Boutique** is a cloud-first…`) after stripping comments/badges.
  const head = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .slice(0, 2500);
  const bold =
    /^\s*\*\*([^*]{2,60})\*\*\s+is\b/im.exec(head) ??
    /\n\s*\*\*([^*]{2,60})\*\*\s+is\b/i.exec(head);
  if (!bold?.[1]) return undefined;
  const boldTitle = sanitizeMarkdownHeadingText(bold[1]);
  if (!boldTitle || /^https?:\/\//i.test(boldTitle) || boldTitle.length > 80) {
    return undefined;
  }
  return boldTitle;
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
  if (readmeTitle) {
    const title = readmeTitle.trim();
    // Plain lowercase README brands (`podinfo`) read as product names once
    // title-cased; multi-word / already-cased titles stay as authored.
    if (/^[a-z][a-z0-9]*$/.test(title)) {
      return humanizePackageName(title);
    }
    return title;
  }
  if (pkg) return humanizePackageName(pkg);
  const base = fallback.trim();
  return /[-_]/.test(base) ? humanizePackageName(base) : base;
}

/** README titles that are sample/demo boilerplate rather than the product name. */
export function isSampleBoilerplateTitle(title: string): boolean {
  return /\b(sample|example|demo|boilerplate)\b/i.test(title.trim());
}

/**
 * OpenAPI/Swagger docs chrome that must not own the Product Flow API hub
 * (Shree Heart field fail: info.title / README "## API Documentation").
 * Prefer path-role `HTTP API` or a real product heading ("Notes API").
 */
export function isGenericApiDocsTitle(title: string): boolean {
  const text = title.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;

  // Bare swagger/openapi tooling names without a product noun.
  if (
    /^(?:openapi|swagger)(?:\s+(?:ui|spec(?:ification)?|definition|docs?|documentation))?$/.test(
      text,
    )
  ) {
    return true;
  }

  // "API Documentation", "REST API Docs", "HTTP API Reference", …
  if (
    /^(?:(?:rest|http|web)\s+)?api(?:\s+(?:docs?|documentation|reference|spec(?:ification)?|definition|description))?$/.test(
      text,
    )
  ) {
    return true;
  }

  // "OpenAPI Documentation", "Swagger API Docs", "OAS Spec", …
  if (
    /^(?:openapi|swagger|oas)(?:\s+api)?(?:\s+(?:docs?|documentation|reference|spec(?:ification)?|definition))?$/.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * OpenAPI `info.title` often appends version chrome ("Swagger Petstore - OpenAPI 3.0").
 * Strip that so the canvas brand reads as the product.
 */
export function cleanOpenApiInfoTitle(title: string): string {
  return title
    .trim()
    .replace(/\s*[-–—|:]\s*(?:OpenAPI|Swagger|OAS)\s*\d+(?:\.\d+)*\s*$/i, "")
    .trim();
}

/** OpenAPI summaries are sentence fragments — drop trailing periods on the canvas. */
export function humanizeOpenApiSummaryLabel(summary: string): string {
  return summary.trim().replace(/[.。]+$/u, "").trim();
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
  "Deploy",
]);

/**
 * README project-structure liturgy — numbered layers, file globs, folder maps.
 * These must never become Product Flow system labels (Shree Heart field fail:
 * `1. Route Layer (.route.ts)` → API).
 */
export function isReadmeStructureHeading(heading: string): boolean {
  const text = heading.trim();
  if (!text) return false;

  const hasLayerWord = /\blayers?\b/i.test(text);
  const numbered = /^\d+[\.\):]\s+/.test(text);
  // File / folder pattern chrome in parens or backticks: (.route.ts), (*.ts), (models/)
  const hasPathChrome =
    /\([^)]*\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs)[^)]*\)/i.test(text) ||
    /\(\s*\*\.[a-z0-9]+[^)]*\)/i.test(text) ||
    /`[^`]*\.[a-z0-9]+`/i.test(text) ||
    /\(\s*[a-z0-9_.*/-]+\/\s*\)/i.test(text);

  // "1. Route Layer (.route.ts)", "5. Data Access Layer (models/)", "5. Data Access Layer…"
  if (numbered && hasLayerWord) return true;
  if (hasLayerWord && hasPathChrome) return true;

  // Bare folder/file map lines without "Layer": "2. Controllers (*.controller.ts)"
  if (numbered && hasPathChrome) return true;

  return false;
}

/**
 * Map a markdown heading onto a known system key. Returns undefined when the
 * heading is generic docs chrome (Status, License, …) or does not name a role.
 */
export function inferSystemKeyFromHeading(heading: string): string | undefined {
  const text = heading.trim().toLowerCase();
  if (!text) return undefined;

  // Numbered Layer / file-glob structure docs are not product system names.
  if (isReadmeStructureHeading(heading)) {
    return undefined;
  }

  // OpenAPI/Swagger docs chrome ("API Documentation") must not rename HTTP API.
  if (isGenericApiDocsTitle(heading)) {
    return undefined;
  }

  // Skip common README scaffolding that should never rename product systems.
  if (
    /^(status|license|roadmap|near-term roadmap|try it|getting started|prerequisites?|environment variables?|install(?:ation)?|usage|contributing|changelog|design principles|overview|introduction|about|motivation|cheatsheets?|faq|table of contents|project structure|list of packages|useful tools and resources)$/i.test(
      text,
    )
  ) {
    return undefined;
  }

  // Cheatsheet / FAQ section titles with logos ("ES6 Cheatsheet", "Mongoose Cheatsheet").
  if (/\bcheatsheets?\b|\bfaq\b/.test(text)) {
    return undefined;
  }

  // Skip imperative how-to headings ("Generate your Prisma client", "Seed the database").
  // Also "To run (via Docker)" — docs chrome, not a Deploy system name.
  if (
    /^(to\s+)?(generate|install|run|create|configure|deploy|build|test|clone|download|add|update|set\s*up|make|enable|start|seed|apply|migrate|push|pull|open|visit|follow|copy|paste|replace|remove|delete|drop|reset)\b/.test(
      text,
    )
  ) {
    return undefined;
  }

  // Skip FAQ / question headings ("Why do you have all routes defined in app.js?").
  // They mention routes/API/database but are docs chrome, not system names.
  if (
    /\?/.test(text) ||
    /^(why|how|what|when|where|who|which|can|should|does|do|is|are|will|i\s+(?:am|get|got|have|see))\b/.test(
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
    // Docker/Compose — prefer "Containers"; avoid bare "docker" (matches "via Docker" how-tos).
    {
      key: "deploy",
      pattern: /\bcontainers?\b|\bdocker-compose\b|\bcompose\s+(?:file|services?)\b/,
      weight: 7,
    },
    // Terraform / infra — prefer "Infrastructure"; avoid bare "deploy with Terraform" how-tos.
    {
      key: "deploy",
      pattern:
        /\binfrastructure\b|\binfra\b|\bterraform\s+(?:stack|module|resources?|configuration)\b/,
      weight: 7,
    },
    // Kubernetes manifests — prefer "Workloads"; avoid bare "deploy to k8s" how-tos.
    {
      key: "deploy",
      pattern:
        /\bworkloads?\b|\bkubernetes\b|\bk8s\b|\bmanifests?\b/,
      weight: 7,
    },
    // Helm charts — prefer "Charts"; avoid bare "helm upgrade" how-tos.
    {
      key: "deploy",
      pattern: /\bhelm\s+charts?\b|\bcharts?\b/,
      weight: 7,
    },
    // Kustomize overlays — prefer "Overlays"; avoid bare "kustomize build" how-tos.
    {
      key: "deploy",
      pattern: /\boverlays?\b|\bkustomize\b|\bkustomization\b/,
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
    // Defense in depth: never paint structure liturgy or docs chrome onto the canvas.
    if (
      isReadmeStructureHeading(hint.label) ||
      isReadmeStructureHeading(hint.heading) ||
      isGenericApiDocsTitle(hint.label) ||
      isGenericApiDocsTitle(hint.heading)
    ) {
      continue;
    }
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
  "deploy",
];

function flowOrderRank(key: string): number {
  // App Router page molecules occupy the UI slot, ordered among themselves by key.
  if (key.startsWith("page:")) {
    const uiIndex = flowOrderPreference.indexOf("ui");
    return uiIndex === -1 ? flowOrderPreference.length : uiIndex;
  }
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
  // Collapsed chrome systems stay in the graph for Details/search but must not
  // occupy the Product flow band (e.g. empty CLI beside a GraphQL HTTP API).
  const keys = [...systems.keys()].filter(
    (key) => systems.get(key)?.metadata?.collapsedInOverview !== true,
  );
  const keySet = new Set(keys);
  const indegree = new Map(keys.map((key) => [key, 0]));
  const adjacency = new Map(keys.map((key) => [key, [] as string[]]));

  for (const [from, to] of flowPairs) {
    if (!keySet.has(from) || !keySet.has(to)) continue;
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

/**
 * Root / health / readiness probes — not enough HTTP surface to lead a
 * Compose-deployed product story on the overview.
 */
function isThinHttpRoutePath(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed) return false;
  const normalized =
    trimmed.replace(/\/+$/, "").replace(/^\//, "").toLowerCase() || "";
  // Empty after strip → "/" root. Also accept /api and common probes.
  return (
    normalized === "" ||
    normalized === "api" ||
    /^(healthz?|readyz?|livez?|ping|status|favicon\.ico)$/.test(normalized)
  );
}

/**
 * On product apps (not Underdelta itself), path-role chrome can invent systems
 * that steal the North-star cold-read: bare `schema.ts` → "Schema contract",
 * package.json `bin` → empty "CLI", `db.ts` → empty "Data access". Fold or
 * collapse those so an API-led map (GraphQL/OpenAPI/Express) reads cleanly.
 * Compiler stacks (compile/extractors/graph/viewer) keep their full story.
 */
function quietNonCompilerProductChrome(
  systems: Map<string, ArchitectureNode>,
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  moduleToSystem: Map<string, string>,
  productId: string,
): void {
  const hasCompilerStack =
    systems.has("compile") ||
    systems.has("extractors") ||
    systems.has("graph") ||
    systems.has("viewer");
  if (hasCompilerStack) return;

  const api = systems.get("api");

  // `src/schema.ts` in a GraphQL/product server is API surface, not an
  // architecture Schema contract. Fold into HTTP API when both exist.
  const schema = systems.get("schema");
  if (schema && api) {
    for (const node of nodes.values()) {
      if (node.parentId !== schema.id) continue;
      node.parentId = api.id;
      node.metadata = {
        ...node.metadata,
        projectedSystem: "api",
        collapsedInOverview: true,
      };
      nodes.set(node.id, node);
      if (moduleToSystem.has(node.id)) {
        moduleToSystem.set(node.id, api.id);
      }
    }
    for (const [edgeId, edge] of [...edges.entries()]) {
      if (edge.source === schema.id || edge.target === schema.id) {
        if (edge.kind === "contains" && edge.source === schema.id) {
          const retargeted = edgeFrom(
            "contains",
            api.id,
            edge.target,
            edge.evidence[0] ??
              projectionEvidence(".", "Folded Schema contract module under HTTP API"),
          );
          edges.delete(edgeId);
          if (!edges.has(retargeted.id)) edges.set(retargeted.id, retargeted);
          continue;
        }
        edges.delete(edgeId);
      }
    }
    // Drop product → schema contains; keep product → api.
    for (const [edgeId, edge] of [...edges.entries()]) {
      if (
        edge.kind === "contains" &&
        edge.source === productId &&
        edge.target === schema.id
      ) {
        edges.delete(edgeId);
      }
    }
    nodes.delete(schema.id);
    systems.delete("schema");
    api.evidence = dedupeEvidence([
      ...api.evidence,
      projectionEvidence(
        ".",
        "Folded path-role Schema contract into HTTP API (no compiler stack)",
      ),
    ]);
    nodes.set(api.id, api);
  }

  // Empty CLI from package.json bin with no child modules — hide on overview.
  const cli = systems.get("cli");
  if (cli) {
    const cliChildren = [...nodes.values()].some(
      (node) => node.parentId === cli.id,
    );
    if (!cliChildren) {
      cli.metadata = {
        ...cli.metadata,
        collapsedInOverview: true,
      };
      nodes.set(cli.id, cli);
    }
  }

  // Data access with only modules/functions (no tables/collections) — quiet.
  const data = systems.get("data");
  if (data) {
    const hasDataSurface = [...nodes.values()].some(
      (node) =>
        node.parentId === data.id &&
        (node.kind === "table" ||
          node.kind === "collection" ||
          node.kind === "database"),
    );
    if (!hasDataSurface) {
      data.metadata = {
        ...data.metadata,
        collapsedInOverview: true,
      };
      nodes.set(data.id, data);
    }
  }

  // Dockerfile-only Deploy beside API/UI/Data is packaging chrome, not the
  // product story (RealWorld/Petstore ships a Dockerfile). Keep Deploy visible
  // when Compose / Terraform / Kubernetes / Helm / Kustomize units exist.
  const deploy = systems.get("deploy");
  const hasDeployUnits = Boolean(
    deploy &&
      [...nodes.values()].some(
        (node) =>
          node.parentId === deploy.id &&
          (node.metadata?.dockerService === true ||
            node.metadata?.terraformResource === true ||
            node.metadata?.terraformModuleBlock === true ||
            node.metadata?.kubernetesResource === true ||
            node.metadata?.helmChart === true ||
            node.metadata?.helmResource === true ||
            node.metadata?.kustomization === true),
      ),
  );
  if (deploy) {
    const hasProductSurface =
      systems.has("api") || systems.has("ui") || systems.has("data");
    if (hasProductSurface && !hasDeployUnits) {
      deploy.metadata = {
        ...deploy.metadata,
        collapsedInOverview: true,
      };
      nodes.set(deploy.id, deploy);
    }
  }

  // Compose-led apps (example-voting-app) often pick up a single root GET /
  // from a result UI server. Kubernetes-led apps (Online Boutique) invent a
  // path-role HTTP API from bare `server.js` modules with no routes. Either
  // thin-or-empty API steals the cold-read from Deploy — collapse it.
  const hasComposeServices = Boolean(
    deploy &&
      [...nodes.values()].some(
        (node) =>
          node.parentId === deploy.id &&
          node.metadata?.dockerService === true,
      ),
  );
  const hasKubernetesUnits = Boolean(
    deploy &&
      [...nodes.values()].some(
        (node) =>
          node.parentId === deploy.id &&
          node.metadata?.kubernetesResource === true,
      ),
  );
  const hasHelmUnits = Boolean(
    deploy &&
      [...nodes.values()].some(
        (node) =>
          node.parentId === deploy.id &&
          (node.metadata?.helmChart === true ||
            node.metadata?.helmResource === true),
      ),
  );
  // Product Overlay hubs only — Boutique kustomize/components stay chrome and
  // must not drive Deploy-led API quieting.
  const hasKustomizeUnits = Boolean(
    deploy &&
      [...nodes.values()].some(
        (node) =>
          node.parentId === deploy.id &&
          node.metadata?.kustomization === true &&
          node.metadata?.exampleChrome !== true &&
          node.metadata?.kustomizeChrome !== true,
      ),
  );
  if (
    api &&
    (hasComposeServices ||
      hasKubernetesUnits ||
      hasHelmUnits ||
      hasKustomizeUnits)
  ) {
    const apiRoutes = [...nodes.values()].filter(
      (node) => node.parentId === api.id && node.kind === "route",
    );
    const thinOrEmptyApi =
      apiRoutes.length === 0 ||
      apiRoutes.every((route) => isThinHttpRoutePath(route.metadata?.path));
    // Overlay-led apps (podinfo) ship a fat OpenAPI contract beside deploy/
    // bases+overlays — that HTTP API steals the cold-read from Deploy.
    const openApiBesideOverlays =
      hasKustomizeUnits &&
      apiRoutes.length > 0 &&
      apiRoutes.every((route) =>
        (route.evidence ?? []).some((item) => item.extractor === "openapi"),
      );
    if (thinOrEmptyApi || openApiBesideOverlays) {
      api.metadata = {
        ...api.metadata,
        collapsedInOverview: true,
      };
      nodes.set(api.id, api);
    }
  }

  // Compose/K8s/Helm/Kustomize-led apps may still grow a module-only UI blob
  // (path-role `views/` / `components/` chrome with no page atoms). Without
  // route molecules that steals the Deploy North-star cold-read — collapse it.
  const ui = systems.get("ui");
  if (
    ui &&
    (hasComposeServices ||
      hasKubernetesUnits ||
      hasHelmUnits ||
      hasKustomizeUnits)
  ) {
    const hasRouteMolecules = [...systems.keys()].some((key) =>
      key.startsWith("page:"),
    );
    const hasPageAtoms = [...nodes.values()].some(
      (node) =>
        node.kind === "page" &&
        (node.metadata?.next === "page" ||
          node.metadata?.vue === "page" ||
          node.metadata?.framework === "next" ||
          node.metadata?.framework === "vue"),
    );
    if (!hasRouteMolecules && !hasPageAtoms) {
      ui.metadata = {
        ...ui.metadata,
        collapsedInOverview: true,
      };
      nodes.set(ui.id, ui);
    }
  }

  // Drop flows-to / collab edges that point at collapsed *semantic* chrome
  // systems so the IR matches the overview (no ghost API→Data story).
  // Atom leaves (pages/feature roots) stay collapsedInOverview for Beginner,
  // but their renders/calls story edges must survive for Intermediate drill.
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (
      edge.kind !== "flows-to" &&
      edge.kind !== "uses" &&
      edge.kind !== "renders" &&
      edge.kind !== "exposes" &&
      edge.kind !== "triggers" &&
      edge.kind !== "configures"
    ) {
      continue;
    }
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    const sourceChrome =
      source?.metadata?.collapsedInOverview === true &&
      source.metadata?.projection === "semantic";
    const targetChrome =
      target?.metadata?.collapsedInOverview === true &&
      target.metadata?.projection === "semantic";
    if (sourceChrome || targetChrome) {
      edges.delete(edgeId);
    }
  }
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

/** OpenAPI/Swagger spec paths — modules even though they are not JS/TS/Py. */
function isOpenApiSpecModulePath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  return (
    /(^|\/)(openapi|swagger)\.(json|ya?ml)$/.test(normalized) ||
    /(?:^|\/)openapi\/.+\.(json|ya?ml)$/.test(normalized)
  );
}

/** GraphQL SDL / document paths — modules even though they are not JS/TS/Py. */
function isGraphqlSchemaModulePath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  return (
    /\.(?:graphql|gql)$/.test(normalized) ||
    /(?:^|\/)graphql\//.test(normalized)
  );
}

/** Dockerfile / Compose paths — modules even though they are not JS/TS/Py. */
function isDockerModulePath(file: string): boolean {
  const normalized = normalizePath(file);
  const base = normalized.split("/").pop()?.toLowerCase() ?? "";
  return (
    base === "dockerfile" ||
    base.startsWith("dockerfile.") ||
    base.endsWith(".dockerfile") ||
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml" ||
    /^docker-compose\.[^/]+\.ya?ml$/.test(base)
  );
}

/** Terraform `.tf` paths — modules even though they are not JS/TS/Py. */
function isTerraformModulePath(file: string): boolean {
  return /\.tf$/i.test(normalizePath(file));
}

/** Kubernetes manifest paths — modules even though they are not JS/TS/Py. */
function isKubernetesModulePath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  const base = normalized.split("/").pop() ?? "";
  if (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml" ||
    /^docker-compose\.[^/]+\.ya?ml$/.test(base) ||
    isOpenApiSpecModulePath(normalized) ||
    /(^|\/)charts?\//.test(normalized) ||
    /(^|\/)helm(?:-?chart)?\//.test(normalized) ||
    /(^|\/)\.github\//.test(normalized)
  ) {
    return false;
  }
  return (
    /(^|\/)(k8s|kubernetes)(-?manifests?)?(\/|$)/.test(normalized) ||
    /(^|\/)manifests?(\/|$)/.test(normalized) ||
    /(^|\/)deploy(?:ment)?s?\//.test(normalized) ||
    /\.(?:deployment|service|ingress|statefulset|daemonset|cronjob)\.ya?ml$/.test(
      normalized,
    ) ||
    /(?:^|\/)(?:deployment|service|ingress)\.ya?ml$/.test(normalized)
  );
}

/** Helm Chart.yaml + templates under charts/helm trees. */
function isHelmModulePath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  const base = normalized.split("/").pop() ?? "";
  if (base === "chart.yaml" || base === "chart.yml") return true;
  if (
    /(^|\/)charts?\//.test(normalized) ||
    /(^|\/)helm(?:-?chart)?\//.test(normalized)
  ) {
    return /\.ya?ml$/.test(normalized);
  }
  return false;
}

/** Kustomize kustomization.yaml + overlay trees. */
function isKustomizeModulePath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  const base = normalized.split("/").pop() ?? "";
  if (base === "kustomization.yaml" || base === "kustomization.yml") {
    return true;
  }
  if (
    /(^|\/)kustomize\//.test(normalized) ||
    /(^|\/)overlays?\//.test(normalized) ||
    /(^|\/)bases?\//.test(normalized)
  ) {
    return /\.ya?ml$/.test(normalized);
  }
  return false;
}

function isFileModule(node: ArchitectureNode): boolean {
  if (node.kind !== "module") return false;
  const file = normalizePath(node.qualifiedName ?? node.label);
  return (
    /\.(?:[cm]?[jt]sx?|py)$/i.test(file) ||
    isOpenApiSpecModulePath(file) ||
    isGraphqlSchemaModulePath(file) ||
    isDockerModulePath(file) ||
    isTerraformModulePath(file) ||
    isKubernetesModulePath(file) ||
    isHelmModulePath(file) ||
    isKustomizeModulePath(file) ||
    // Manifest modules emitted by the kubernetes extractor (scattered yaml).
    (node.metadata?.kubernetesModule === true && /\.ya?ml$/i.test(file)) ||
    // Chart/template modules emitted by the helm extractor.
    (node.metadata?.helmModule === true && /\.ya?ml$/i.test(file)) ||
    // kustomization.yaml modules emitted by the kustomize extractor.
    (node.metadata?.kustomizeModule === true && /\.ya?ml$/i.test(file))
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
  // Vue Router page SFCs live under `src/views/` or `views/*View` / `*.vue` —
  // not every `*/views/*.js` (Compose apps ship result/views angular chrome).
  // Router modules are FE routing. Skip Kustomize `components/` overlays.
  if (
    !/(^|\/)kustomize\//.test(file) &&
    (/(^|\/)(ui|components)\//.test(file) ||
      /(^|\/)src\/views\//.test(file) ||
      /(^|\/)views\/[^/]*view[^/]*\.(vue|[cm]?[jt]sx?)$/.test(file) ||
      /\.vue$/.test(file) ||
      /(^|\/)router\.[cm]?[jt]sx?$/.test(file) ||
      file.includes("/router/"))
  ) {
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
  // Client API modules (`src/apis/**`, `apis/**`) — Next/SaaS apps call the
  // backend here (axios/fetch). Not the same as `/api/` path substring.
  if (/(^|\/)apis\//.test(file)) {
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
  // Kustomize `bases/api` / overlay trees are Deploy, not an HTTP API path-role.
  const underKustomizeTree =
    /(^|\/)kustomize\//.test(file) ||
    /(^|\/)overlays?\//.test(file) ||
    /(^|\/)bases?\//.test(file);
  if (
    !underKustomizeTree &&
    (/(^|\/)(server|app|routes?)\.[cm]?[jt]sx?$/.test(file) ||
      file.includes("/routes/") ||
      file.includes("/api/") ||
      // Python servers: Django urlpatterns + FastAPI APIRouter modules.
      /(^|\/)urls\.py$/.test(file) ||
      file.includes("/routers/") ||
      // OpenAPI / Swagger specs are the HTTP API contract surface.
      isOpenApiSpecModulePath(file) ||
      file.includes("/openapi/") ||
      // GraphQL SDL / documents are the API contract surface.
      isGraphqlSchemaModulePath(file))
  ) {
    return { key: "api", label: "HTTP API", kind: "api" };
  }
  // Docker / Compose recipes are the deployable runtime surface.
  if (isDockerModulePath(file)) {
    return { key: "deploy", label: "Deploy", kind: "system" };
  }
  // Terraform `.tf` resources/modules are infrastructure deploy surface.
  if (isTerraformModulePath(file)) {
    return { key: "deploy", label: "Deploy", kind: "system" };
  }
  // Kubernetes manifests are workload deploy surface.
  if (isKubernetesModulePath(file)) {
    return { key: "deploy", label: "Deploy", kind: "system" };
  }
  // Helm charts / templates are packaged workload deploy surface.
  if (isHelmModulePath(file)) {
    return { key: "deploy", label: "Deploy", kind: "system" };
  }
  // Kustomize overlays / bases are product deploy surface.
  if (isKustomizeModulePath(file)) {
    return { key: "deploy", label: "Deploy", kind: "system" };
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
    /(^|\/)database\//.test(file) ||
    // Mongoose / Mongo model folders commonly live under models/.
    /(^|\/)models\//.test(file) ||
    /(^|\/)models\.[cm]?[jt]sx?$/.test(file)
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

/**
 * Product acronyms kept uppercase in North-star labels.
 * `ai_agent_checkpoints` → `AI agent checkpoint`, `RAG_CHUNKS` → `RAG chunks`.
 */
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
  // OpenTelemetry is a product name, not OTEL shouting.
  "opentelemetry",
]);

/** Mixed-case product acronyms that should not become ALL CAPS. */
const MIXED_CASE_ACRONYMS: Record<string, string> = {
  oauth: "OAuth",
  dynamodb: "DynamoDB",
  opentelemetry: "OpenTelemetry",
};

/**
 * Dictionary of product-name segments found glued in Kubernetes resource
 * names (Online Boutique `productcatalogservice`, `loadgenerator`, …).
 * Longest-first greedy matching turns them into camelCase before humanize.
 */
const KUBERNETES_NAME_SEGMENTS = [
  "opentelemetry",
  "recommendation",
  "product",
  "catalog",
  "shopping",
  "assistant",
  "generator",
  "collector",
  "checkout",
  "currency",
  "payment",
  "shipping",
  "frontend",
  "backend",
  "service",
  "redis",
  "email",
  "cart",
  "load",
  "web",
  "api",
  "ad",
].sort((a, b) => b.length - a.length);

function formatProductWord(part: string, index: number): string {
  const lower = part.toLowerCase();
  if (PRODUCT_ACRONYMS.has(lower)) {
    return MIXED_CASE_ACRONYMS[lower] ?? lower.toUpperCase();
  }
  if (index === 0) {
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }
  return lower;
}

function titleCaseSingular(label: string): string {
  const key = normalizeTableKey(label);
  if (!key) return label;
  // team_member → Team member (readable for non-coders; not Team_member).
  // ai_agent_checkpoint → AI agent checkpoint (keep product acronyms).
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part, index) => formatProductWord(part, index))
    .join(" ");
}

/**
 * Cron expressions → plain-English schedule phrases for the North star user.
 * Examples: hourly five-field cron → "every hour"; slash-step minutes →
 * "every 15 minutes". Unrecognized forms keep the original expression.
 */
export function humanizeCronExpression(expression: string): string {
  const expr = expression.trim();
  if (!expr) return expr;
  if (/^@hourly$/i.test(expr)) return "every hour";
  if (/^@daily$/i.test(expr)) return "every day";
  if (/^@weekly$/i.test(expr)) return "every week";
  if (/^@monthly$/i.test(expr)) return "every month";
  if (/^@yearly$/i.test(expr) || /^@annually$/i.test(expr)) return "every year";

  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return expr;
  const minute = parts[0]!;
  const hour = parts[1]!;
  const dayOfMonth = parts[2]!;
  const month = parts[3]!;
  const dayOfWeek = parts[4]!;

  const starRest =
    dayOfMonth === "*" && month === "*" && dayOfWeek === "*";

  if (minute === "*" && hour === "*" && starRest) return "every minute";

  const everyMinute = /^\*\/(\d+)$/.exec(minute);
  if (everyMinute && hour === "*" && starRest) {
    const n = Number(everyMinute[1]);
    return n === 1 ? "every minute" : `every ${n} minutes`;
  }

  if (minute === "0" && hour === "*" && starRest) return "every hour";

  const everyHour = /^\*\/(\d+)$/.exec(hour);
  if (minute === "0" && everyHour && starRest) {
    const n = Number(everyHour[1]);
    return n === 1 ? "every hour" : `every ${n} hours`;
  }

  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `every day at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  if (minute === "0" && hour === "0" && starRest) return "every day";

  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    /^\d+$/.test(dayOfWeek)
  ) {
    const day = weekdays[Number(dayOfWeek) % 7] ?? `day ${dayOfWeek}`;
    return `every ${day} at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  return expr;
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

/**
 * GraphQL Query/Mutation/Subscription → canvas labels for the North star user.
 *
 * - SDL schema fields keep the kind: `createNote` → `Mutation Create note`
 * - Named `gql` documents drop the kind (like OpenAPI summaries) so they stay
 *   distinct from the schema twin: `CreateNote` → `Create note` (not another
 *   `Mutation Create note` colliding with the SDL field).
 */
export function humanizeGraphqlOperationLabel(
  operationType: string,
  field: string,
  options?: { sourceKind?: "sdl" | "gql"; operationName?: string },
): string {
  if (options?.sourceKind === "gql" && options.operationName?.trim()) {
    return humanizeIdentifierLabel(options.operationName);
  }
  const kind = operationType.trim().toLowerCase();
  const titled =
    kind === "query" || kind === "mutation" || kind === "subscription"
      ? kind.charAt(0).toUpperCase() + kind.slice(1)
      : "Query";
  return `${titled} ${humanizeIdentifierLabel(field)}`;
}

/**
 * App Router URL paths → product page labels for the North star non-coder.
 * `/dashboard/activity` → `Dashboard · Activity`, `/sign-in` → `Sign in`.
 */
/**
 * Presentational UI-kit names (shadcn-style Card/Button/…) — Intermediate
 * system-design maps keep feature roots only; these stay Advanced/code.
 */
const PRESENTATIONAL_COMPONENT_NAME =
  /^(?:App)?(?:Card|Button|Icon|Badge|Skeleton|Toggle|Avatar|Spinner|Separator|Divider|Input|Label|Textarea|Checkbox|Switch|Tooltip|Dialog|Modal|Sheet|Popover|Dropdown|Select|Slider|Progress|Toast|Alert|Link|Image|Spacer|Container|Wrapper|Provider|Theme|Portal|Overlay|Backdrop|Close|Chevron|Menu|Nav|Header|Footer|Sidebar|Toolbar|Tab|Tabs|Pill|Chip|Tag|Kbd|Code|Pre|Table|Row|Cell|Grid|Stack|Flex|Box|Slot|VisuallyHidden)(?:[A-Z].*)?$/;

function isPresentationalComponentName(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  // Humanized labels ("Post list") are never presentational chrome names.
  if (/\s/.test(trimmed)) return false;
  return PRESENTATIONAL_COMPONENT_NAME.test(trimmed);
}

function isAppRouterPageOrLayoutFile(file: string): boolean {
  const normalized = normalizePath(file);
  return /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(page|layout)\.[cm]?[jt]sx?$/i.test(
    normalized,
  );
}

/**
 * FE atom catalog: feature-root components (one hop from page/layout via
 * imports/renders) stay Intermediate-visible; leaf presentational chrome
 * (Card/Button, stories, deeper hops) is marked leafChrome for Advanced only.
 */
function markFeFeatureRootsAndLeafChrome(
  nodes: Map<string, ArchitectureNode>,
  graph: ArchitectureGraph,
): void {
  const pageOrLayoutOwners = new Set<string>();
  for (const node of nodes.values()) {
    if (node.metadata?.next === "page" || node.metadata?.next === "layout") {
      pageOrLayoutOwners.add(node.id);
    }
    if (node.kind === "module") {
      const file = normalizePath(node.qualifiedName ?? node.label);
      if (isAppRouterPageOrLayoutFile(file)) {
        pageOrLayoutOwners.add(node.id);
      }
    }
    if (
      (node.kind === "component" || node.kind === "page") &&
      node.evidence.some((item) => isAppRouterPageOrLayoutFile(item.file))
    ) {
      pageOrLayoutOwners.add(node.id);
    }
  }

  const moduleComponentIds = new Map<string, string[]>();
  for (const node of nodes.values()) {
    if (node.kind !== "component") continue;
    const file = normalizePath(node.evidence[0]?.file ?? "");
    if (!file) continue;
    const moduleId = stableId("module", file);
    const list = moduleComponentIds.get(moduleId) ?? [];
    list.push(node.id);
    moduleComponentIds.set(moduleId, list);
    // Also index by observed module node ids (hash-stable via same file).
    if (node.parentId) {
      const parentList = moduleComponentIds.get(node.parentId) ?? [];
      parentList.push(node.id);
      moduleComponentIds.set(node.parentId, parentList);
    }
  }
  for (const node of nodes.values()) {
    if (node.kind !== "module") continue;
    const file = normalizePath(node.qualifiedName ?? node.label);
    const fromEvidence = [...nodes.values()].filter(
      (candidate) =>
        candidate.kind === "component" &&
        candidate.evidence.some(
          (item) => normalizePath(item.file) === file,
        ),
    );
    if (fromEvidence.length) {
      moduleComponentIds.set(
        node.id,
        fromEvidence.map((candidate) => candidate.id),
      );
    }
  }

  const featureRootIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "renders") continue;
    if (!pageOrLayoutOwners.has(edge.source)) continue;
    const target = nodes.get(edge.target);
    if (!target) continue;
    if (target.kind === "component") {
      featureRootIds.add(target.id);
      continue;
    }
    if (target.kind === "module") {
      for (const id of moduleComponentIds.get(target.id) ?? []) {
        featureRootIds.add(id);
      }
      const file = normalizePath(target.qualifiedName ?? target.label);
      for (const node of nodes.values()) {
        if (
          node.kind === "component" &&
          node.evidence.some((item) => normalizePath(item.file) === file)
        ) {
          featureRootIds.add(node.id);
        }
      }
    }
  }

  for (const node of nodes.values()) {
    if (node.kind !== "component") continue;
    if (node.metadata?.projection === "semantic") continue;

    // App Router page/layout convention atoms + default-export bodies stay
    // Intermediate atoms — they are not leaf UI chrome.
    if (node.metadata?.next === "page" || node.metadata?.next === "layout") {
      node.metadata = {
        ...node.metadata,
        collapsedInOverview: true,
      };
      nodes.set(node.id, node);
      continue;
    }

    const evidenceFile = normalizePath(node.evidence[0]?.file ?? "");
    const isStories = /\.stories\./i.test(evidenceFile);
    const presentational = isPresentationalComponentName(node.label);
    const oneHopFromPage = featureRootIds.has(node.id);

    if (oneHopFromPage && !presentational && !isStories) {
      node.metadata = {
        ...node.metadata,
        featureRoot: true,
        collapsedInOverview: true,
      };
    } else {
      node.metadata = {
        ...node.metadata,
        leafChrome: true,
        collapsedInOverview: true,
      };
    }
    nodes.set(node.id, node);
  }
}

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
 * Top-level App Router segment for FE molecules.
 * `/dashboard/activity` → `/dashboard`; `/` → `/`.
 */
export function appRouterRouteSegment(path: string): string {
  const trimmed = path.trim() || "/";
  if (!trimmed.startsWith("/")) return `/${trimmed}`;
  if (trimmed === "/") return "/";
  const segments = trimmed
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));
  if (!segments.length) return "/";
  return `/${segments[0]}`;
}

function pageMoleculeSystemKey(segment: string): string {
  return `page:${segment}`;
}

/** True when a page atom is a Next App Router or Vue Router product page. */
function isFeRoutePageAtom(node: ArchitectureNode): boolean {
  if (node.kind !== "page" || typeof node.metadata?.path !== "string") {
    return false;
  }
  return (
    node.metadata.next === "page" ||
    node.metadata.vue === "page" ||
    node.metadata.framework === "next" ||
    node.metadata.framework === "vue"
  );
}

function fePageFramework(page: ArchitectureNode): "next" | "vue" | undefined {
  if (page.metadata?.framework === "vue" || page.metadata?.vue === "page") {
    return "vue";
  }
  if (page.metadata?.framework === "next" || page.metadata?.next === "page") {
    return "next";
  }
  return undefined;
}

/**
 * FE molecules: one semantic `ui` hub per top-level route segment (Next App
 * Router or Vue Router). Nest page atoms + page-owned feature roots under the
 * hub; collapse the aggregate UI system so Beginner reads Home / Dashboard —
 * not one UI blob.
 */
function projectFeRouteSegmentMolecules(
  systems: Map<string, ArchitectureNode>,
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  productId: string,
  attachToSystem: (nodeId: string, systemId: string, evidence: Evidence) => void,
): string[] {
  const pageAtoms = [...nodes.values()].filter(isFeRoutePageAtom);
  if (pageAtoms.length < 2) return [];

  const bySegment = new Map<string, ArchitectureNode[]>();
  for (const page of pageAtoms) {
    const path = String(page.metadata!.path);
    const segment = appRouterRouteSegment(path);
    const bucket = bySegment.get(segment) ?? [];
    bucket.push(page);
    bySegment.set(segment, bucket);
  }
  if (bySegment.size < 2) return [];

  // Page atoms own modules by evidence file; feature roots are reached via
  // module-level imports/renders (page.tsx → PostList.tsx), not page-atom edges.
  // Vue Router pages live in the router module — also own bound view modules.
  const pageFileToSegment = new Map<string, string>();
  for (const page of pageAtoms) {
    const path = String(page.metadata!.path);
    const segment = appRouterRouteSegment(path);
    for (const item of page.evidence) {
      if (item.file && item.file !== ".") {
        pageFileToSegment.set(normalizePath(item.file), segment);
      }
    }
  }
  const ownerIdsToSegment = new Map<string, string>();
  for (const page of pageAtoms) {
    const segment = appRouterRouteSegment(String(page.metadata!.path));
    ownerIdsToSegment.set(page.id, segment);
  }
  for (const node of nodes.values()) {
    if (node.kind !== "module") continue;
    const file = modulePath(node);
    const segment = pageFileToSegment.get(file);
    if (segment) ownerIdsToSegment.set(node.id, segment);
  }
  // Default-export page bodies (Home page) also count as owners when they import.
  for (const node of nodes.values()) {
    if (node.kind !== "component" && node.kind !== "function") continue;
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (
      parent &&
      parent.kind === "page" &&
      typeof parent.metadata?.path === "string"
    ) {
      ownerIdsToSegment.set(
        node.id,
        appRouterRouteSegment(parent.metadata.path),
      );
    }
  }
  // Vue Router: page -[routes-to]-> view module owns that segment's features.
  for (const edge of edges.values()) {
    if (edge.kind !== "routes-to") continue;
    const page = nodes.get(edge.source);
    if (!page || !isFeRoutePageAtom(page)) continue;
    const segment = appRouterRouteSegment(String(page.metadata!.path));
    ownerIdsToSegment.set(edge.target, segment);
  }

  const pageOwnedFeatureRoots = new Map<string, Set<string>>();
  const addFeature = (segment: string, featureId: string): void => {
    const bucket = pageOwnedFeatureRoots.get(segment) ?? new Set<string>();
    bucket.add(featureId);
    pageOwnedFeatureRoots.set(segment, bucket);
  };
  for (const edge of edges.values()) {
    if (edge.kind !== "imports" && edge.kind !== "renders") continue;
    const segment = ownerIdsToSegment.get(edge.source);
    if (!segment) continue;
    const target = nodes.get(edge.target);
    if (!target) continue;
    if (target.kind === "component" && target.metadata?.featureRoot === true) {
      addFeature(segment, target.id);
      continue;
    }
    if (target.kind === "module") {
      const targetFile = modulePath(target);
      for (const node of nodes.values()) {
        if (node.kind !== "component" || node.metadata?.featureRoot !== true) {
          continue;
        }
        if (
          node.parentId === target.id ||
          node.evidence.some(
            (item) => normalizePath(item.file) === targetFile,
          )
        ) {
          addFeature(segment, node.id);
        }
      }
    }
  }

  const moleculeKeys: string[] = [];
  const sortedSegments = [...bySegment.keys()].sort((a, b) =>
    a.localeCompare(b),
  );

  for (const segment of sortedSegments) {
    const pages = bySegment.get(segment)!;
    const key = pageMoleculeSystemKey(segment);
    const systemId = stableId("system", key);
    const label = humanizeAppPathLabel(segment);
    const framework = fePageFramework(pages[0]!) ?? "next";
    const evidence = dedupeEvidence(
      pages.flatMap((page) => page.evidence).slice(0, 8),
    );
    const seedEvidence =
      evidence[0] ??
      projectionEvidence(
        pages[0]?.evidence[0]?.file ?? ".",
        `FE route molecule ${segment}`,
      );

    let molecule = systems.get(key);
    if (!molecule) {
      molecule = {
        id: systemId,
        kind: "ui",
        label,
        technology: "semantic",
        metadata: {
          projection: "semantic",
          systemKey: key,
          routeMolecule: true,
          path: segment,
          framework,
        },
        evidence: [
          {
            ...seedEvidence,
            detail:
              seedEvidence.detail ??
              `FE molecule for route segment ${segment}`,
          },
        ],
      };
      systems.set(key, molecule);
      nodes.set(molecule.id, molecule);
      const productEdge = edgeFrom(
        "contains",
        productId,
        molecule.id,
        seedEvidence,
      );
      edges.set(productEdge.id, productEdge);
    } else {
      molecule.label = label;
      molecule.metadata = {
        ...molecule.metadata,
        routeMolecule: true,
        path: segment,
        framework,
      };
      molecule.evidence = dedupeEvidence([...molecule.evidence, ...evidence]);
      nodes.set(molecule.id, molecule);
    }
    moleculeKeys.push(key);

    for (const page of pages) {
      attachToSystem(page.id, molecule.id, page.evidence[0] ?? seedEvidence);
      page.metadata = {
        ...page.metadata,
        projectedSystem: key,
        routeMolecule: key,
      };
      nodes.set(page.id, page);
    }

    // Matching layout atoms (same segment path) live with the route molecule.
    for (const node of [...nodes.values()]) {
      if (node.metadata?.next !== "layout") continue;
      if (typeof node.metadata.path !== "string") continue;
      if (appRouterRouteSegment(node.metadata.path) !== segment) continue;
      attachToSystem(node.id, molecule.id, node.evidence[0] ?? seedEvidence);
      node.metadata = {
        ...node.metadata,
        projectedSystem: key,
        routeMolecule: key,
      };
      nodes.set(node.id, node);
    }

    for (const featureId of pageOwnedFeatureRoots.get(segment) ?? []) {
      const feature = nodes.get(featureId);
      if (!feature) continue;
      attachToSystem(featureId, molecule.id, feature.evidence[0] ?? seedEvidence);
      feature.metadata = {
        ...feature.metadata,
        projectedSystem: key,
        routeMolecule: key,
      };
      nodes.set(featureId, feature);
    }

    molecule.evidence = dedupeEvidence(molecule.evidence);
    nodes.set(molecule.id, molecule);
  }

  return moleculeKeys;
}

/** Collapse aggregate UI once route molecules own the Beginner band. */
function collapseAggregateUiBehindRouteMolecules(
  systems: Map<string, ArchitectureNode>,
  nodes: Map<string, ArchitectureNode>,
): void {
  const pageMoleculeCount = [...systems.keys()].filter((key) =>
    key.startsWith("page:"),
  ).length;
  const ui = systems.get("ui");
  if (!ui || pageMoleculeCount < 2) return;
  ui.metadata = {
    ...ui.metadata,
    collapsedInOverview: true,
    replacedByRouteMolecules: true,
  };
  nodes.set(ui.id, ui);
}

/** Max FE route molecules on Beginner Product Flow (Shree learn field gate). */
export const BEGINNER_ROUTE_MOLECULE_CAP = 8;

/**
 * Scholar / FE-only calm gate: Beginner page hubs must stay ≤ this count.
 * Learn compression uses the tighter {@link BEGINNER_ROUTE_MOLECULE_CAP};
 * this is the field ceiling for UI-only apps (shree-scholar).
 */
export const SCHOLAR_BEGINNER_HUB_MAX = 12;

/** Backend system keys that count as honest neighbors for FE product stories. */
const HONEST_BACKEND_SYSTEM_KEYS = [
  "api",
  "data",
  "jobs",
  "workers",
  "pipelines",
] as const;

/**
 * True when a visible (non-collapsed) API / Data / Jobs-style system exists.
 * Empty Data (modules only) and other quieted chrome do not count — FE apps
 * must not invent a backend neighbor from README or path crumbs alone.
 */
export function hasHonestBackendNeighbor(
  systems: Map<string, ArchitectureNode>,
): boolean {
  for (const key of HONEST_BACKEND_SYSTEM_KEYS) {
    const system = systems.get(key);
    if (!system) continue;
    if (system.metadata?.collapsedInOverview === true) continue;
    return true;
  }
  return false;
}

/**
 * Mark FE products with no static API/Data/Jobs evidence as UI-only so
 * Scholar-style apps stay honest (page hubs only; no invented backend).
 */
function markUiOnlyProductHonesty(
  product: ArchitectureNode,
  systems: Map<string, ArchitectureNode>,
  nodes: Map<string, ArchitectureNode>,
): void {
  const hasFeSurface =
    systems.has("ui") ||
    [...systems.keys()].some((key) => key.startsWith("page:"));
  if (!hasFeSurface) return;
  if (hasHonestBackendNeighbor(systems)) return;

  product.metadata = {
    ...product.metadata,
    uiOnly: true,
    uiOnlyReason: "no-static-backend-evidence",
  };
  nodes.set(product.id, product);
}

/**
 * Temp* App Router shells (prototypes / alternate dashboards). Kept on the
 * product side of marketing, but ranked below real Student/Tutor/Home/Login
 * so Beginner is not eight temp hubs.
 */
function isFeTempRouteShell(path: string, segment: string): boolean {
  const p = path.toLowerCase();
  const seg = segment.toLowerCase();
  return seg.startsWith("/temp") || /tempsignin|temp-signin/.test(p);
}

/**
 * Score a route-segment path for Beginner priority (higher = keep on flow).
 * Real product shells / auth beat temp* dashboards; both beat marketing & exams.
 */
export function feRouteMoleculeBeginnerScore(path: string): number {
  const raw = path.trim() || "/";
  const p = raw.toLowerCase();
  const segment = appRouterRouteSegment(raw).toLowerCase();
  const tempShell = isFeTempRouteShell(p, segment);

  // Product auth — not Tempsignin / temp-signin shells.
  if (
    !tempShell &&
    /^\/(signin|login|signup|auth)(\/|$)/.test(p)
  ) {
    return 100;
  }

  // Core product hubs — prefer over temp* when the cap is tight.
  if (
    !tempShell &&
    (p === "/" ||
      segment === "/" ||
      /^\/(student|tutor|home)(\/|$)/.test(p) ||
      /^\/(student|tutor|home)$/.test(segment))
  ) {
    return 98;
  }

  // Other durable product surfaces (demo / dashboard / onboarding…).
  if (
    !tempShell &&
    (/^\/(demo|applicant|dashboard|onboarding|profile|welcome)(\/|$)/.test(p) ||
      /^\/(demo|applicant|dashboard|onboarding|profile|welcome)$/.test(segment))
  ) {
    return 96;
  }

  // Temp shells fill remaining Beginner slots after product hubs.
  if (tempShell) {
    if (/tempsignin|temp-signin/.test(p)) return 72;
    if (/temp(student|tutor|demo|applicant|welcome)/.test(p)) return 70;
    return 68;
  }

  if (/book-demo|be-a-tutor|pricing|quiz|result|blogs|schools|counties|syllabus/.test(p)) {
    return 45;
  }
  if (
    /exam|maths|english|science|coding|career|faq|review|study-material|staar|gcse|national|nineplus|elevenplus|thirteenplus/.test(
      p,
    )
  ) {
    return 10;
  }
  return 50;
}

/**
 * Cap Beginner FE route molecules so foreign Next apps (shree-learn) do not
 * dump every marketing page onto Product Flow. Excess stay Intermediate/Find
 * via collapsedInOverview.
 */
function compressFeBeginnerRouteMolecules(
  systems: Map<string, ArchitectureNode>,
  nodes: Map<string, ArchitectureNode>,
): void {
  const pageEntries = [...systems.entries()].filter(([key, node]) =>
    key.startsWith("page:") && node.metadata?.routeMolecule === true,
  );
  if (pageEntries.length <= BEGINNER_ROUTE_MOLECULE_CAP) return;

  const ranked = pageEntries
    .map(([key, node]) => {
      const path =
        typeof node.metadata?.path === "string" ? node.metadata.path : key.slice(5);
      return {
        key,
        node,
        path,
        score: feRouteMoleculeBeginnerScore(path),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.path.localeCompare(b.path) ||
        a.key.localeCompare(b.key),
    );

  // Cap is a maximum. Prefer product/medium hubs (score > 10); do not fill
  // remaining slots with marketing/exam landings just to reach 8.
  const eligible = ranked.filter((item) => item.score > 10);
  const keep = new Set(
    eligible.slice(0, BEGINNER_ROUTE_MOLECULE_CAP).map((item) => item.key),
  );
  for (const item of ranked) {
    if (keep.has(item.key)) {
      item.node.metadata = {
        ...item.node.metadata,
        beginnerRouteHub: true,
        collapsedInOverview: false,
      };
      nodes.set(item.node.id, item.node);
      systems.set(item.key, item.node);
      continue;
    }
    item.node.metadata = {
      ...item.node.metadata,
      collapsedInOverview: true,
      beginnerRouteHub: false,
      beginnerOmitted: true,
      beginnerOmitReason:
        item.score <= 10 ? "marketing-or-content" : "beginner-cap",
    };
    nodes.set(item.node.id, item.node);
    systems.set(item.key, item.node);
  }
}

/**
 * Max naked route atoms visible under an API Intermediate focus when they are
 * not nested under a domain route group (Shree Heart field gate: no 373-route
 * phonebook). Excess nest under a "More routes" group hub.
 */
export const INTERMEDIATE_NAKED_ROUTE_CAP = 24;

/**
 * Domain key for HTTP route grouping: `/api/users/:id` → `users`,
 * `/articles` → `articles`. Strips leading `api` / `vN`. Probes (`/health`)
 * and empty roots return null so they stay naked under the API hub.
 */
export function httpRouteDomainKey(path: string): string | null {
  let raw = path.trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) raw = `/${raw}`;
  const noQuery = raw.split("?")[0] ?? raw;
  const parts = noQuery.split("/").filter(Boolean);
  while (parts.length && /^(api|v\d+)$/i.test(parts[0]!)) {
    parts.shift();
  }
  if (!parts.length) return null;
  let seg = parts[0]!;
  // Param-only first segments are not domains.
  if (/^[:{<]/.test(seg)) return null;
  seg = seg.replace(/\{([^}]+)\}/g, "$1").replace(/^:/, "").toLowerCase();
  if (/^(healthz?|readyz?|livez?|ping|status|favicon\.ico)$/.test(seg)) {
    return null;
  }
  return seg;
}

function routeGroupSystemKey(domain: string): string {
  return `routes:${domain}`;
}

/** Prefer short probe / root paths when capping naked Intermediate routes. */
export function nakedRouteIntermediateScore(path: string): number {
  if (isThinHttpRoutePath(path)) return 100;
  const key = httpRouteDomainKey(path);
  if (!key) return 80;
  const len = path.trim().length;
  return Math.max(10, 70 - Math.min(50, len));
}

/**
 * OpenAPI / Swagger / GraphQL contract ops already carry calm summary labels.
 * Domain-group only runtime HTTP routes (Express / FastAPI / …) so Heart's
 * Intermediate phonebook shrinks without re-parenting contract surfaces.
 */
function isContractSurfaceRoute(node: ArchitectureNode): boolean {
  if (node.metadata?.openapi === true || node.metadata?.graphql === true) {
    return true;
  }
  const tech = String(node.technology ?? "").toLowerCase();
  return tech === "openapi" || tech === "swagger" || tech === "graphql";
}

/**
 * Intermediate API calm: group Express/Heart-style routes by path-prefix domain
 * under hubs (Users / Articles / …). Nested route atoms stay off the API
 * Intermediate canvas until the group is focused (viewer mirrors detection
 * surfaces). Cap leftover naked routes at INTERMEDIATE_NAKED_ROUTE_CAP.
 */
function projectApiRouteDomainGroups(
  systems: Map<string, ArchitectureNode>,
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  attachToSystem: (
    nodeId: string,
    systemId: string,
    evidence: Evidence,
  ) => void,
): void {
  const api = systems.get("api");
  if (!api) return;

  const routes = [...nodes.values()].filter(
    (node) =>
      node.kind === "route" &&
      node.parentId === api.id &&
      node.metadata?.projection !== "semantic" &&
      !isContractSurfaceRoute(node),
  );
  if (routes.length < 2) return;

  const byDomain = new Map<string, ArchitectureNode[]>();
  const naked: ArchitectureNode[] = [];
  for (const route of routes) {
    const path =
      typeof route.metadata?.path === "string" ? route.metadata.path : "";
    const domain = path ? httpRouteDomainKey(path) : null;
    if (!domain) {
      naked.push(route);
      continue;
    }
    const bucket = byDomain.get(domain) ?? [];
    bucket.push(route);
    byDomain.set(domain, bucket);
  }

  const ensureGroup = (
    domain: string,
    label: string,
    members: ArchitectureNode[],
  ): ArchitectureNode => {
    const key = routeGroupSystemKey(domain);
    const groupId = stableId("system", key);
    const evidence = dedupeEvidence(
      members.flatMap((route) => route.evidence).slice(0, 8),
    );
    const seed =
      evidence[0] ??
      projectionEvidence(
        members[0]?.evidence[0]?.file ?? ".",
        `API route domain group ${domain}`,
      );
    let group = nodes.get(groupId);
    if (!group) {
      group = {
        id: groupId,
        kind: "system",
        label,
        technology: "semantic",
        parentId: api.id,
        metadata: {
          projection: "semantic",
          systemKey: key,
          routeGroup: true,
          routeDomain: domain,
          collapsedInOverview: true,
        },
        evidence: [
          {
            ...seed,
            detail: seed.detail ?? `Route domain ${domain}`,
          },
        ],
      };
      nodes.set(group.id, group);
      const contains = edgeFrom("contains", api.id, group.id, seed);
      edges.set(contains.id, contains);
    } else {
      group.label = label;
      group.parentId = api.id;
      group.metadata = {
        ...group.metadata,
        projection: "semantic",
        systemKey: key,
        routeGroup: true,
        routeDomain: domain,
        collapsedInOverview: true,
      };
      group.evidence = dedupeEvidence([...group.evidence, ...evidence]);
      nodes.set(group.id, group);
    }
    return group;
  };

  for (const [domain, members] of byDomain) {
    if (members.length < 2) {
      naked.push(...members);
      continue;
    }
    const group = ensureGroup(
      domain,
      humanizeIdentifierLabel(domain),
      members,
    );
    for (const route of members) {
      attachToSystem(
        route.id,
        group.id,
        route.evidence[0] ?? projectionEvidence("."),
      );
      route.metadata = {
        ...route.metadata,
        routeGroupMember: true,
        routeGroup: routeGroupSystemKey(domain),
        projectedSystem: routeGroupSystemKey(domain),
      };
      nodes.set(route.id, route);
    }
    group.evidence = dedupeEvidence(group.evidence);
    nodes.set(group.id, group);
  }

  // Cap leftover naked routes under the API hub — excess nest under More routes.
  if (naked.length <= INTERMEDIATE_NAKED_ROUTE_CAP) return;

  const ranked = [...naked].sort((a, b) => {
    const pathA =
      typeof a.metadata?.path === "string" ? a.metadata.path : a.label;
    const pathB =
      typeof b.metadata?.path === "string" ? b.metadata.path : b.label;
    return (
      nakedRouteIntermediateScore(pathB) - nakedRouteIntermediateScore(pathA) ||
      pathA.localeCompare(pathB) ||
      a.id.localeCompare(b.id)
    );
  });
  const overflow = ranked.slice(INTERMEDIATE_NAKED_ROUTE_CAP);
  if (!overflow.length) return;
  const more = ensureGroup("_more", "More routes", overflow);
  for (const route of overflow) {
    attachToSystem(
      route.id,
      more.id,
      route.evidence[0] ?? projectionEvidence("."),
    );
    route.metadata = {
      ...route.metadata,
      routeGroupMember: true,
      routeGroup: routeGroupSystemKey("_more"),
      projectedSystem: routeGroupSystemKey("_more"),
      intermediateOmitted: true,
      intermediateOmitReason: "naked-route-cap",
    };
    nodes.set(route.id, route);
  }
  more.evidence = dedupeEvidence(more.evidence);
  nodes.set(more.id, more);
}

/** Server-action / client-API label → story edge kind (mutations write; getters read). */
function serverActionStoryEdgeKind(label: string): "reads" | "writes" {
  const normalized = label.toLowerCase();
  // Word tokens ("List posts") and camelCase / snake prefixes (listPosts, get_user).
  if (
    /\b(get|list|find|fetch|load|read|query|show|select)\b/.test(normalized) ||
    /^(get|list|find|fetch|load|read|query|show|select)([a-z0-9]|_)/i.test(
      label.replace(/\s+/g, ""),
    )
  ) {
    return "reads";
  }
  return "writes";
}

/** Client API helpers under `apis/**` (axios/fetch wrappers), not server actions. */
function isClientApiFunction(
  node: ArchitectureNode,
  nodes: Map<string, ArchitectureNode>,
): boolean {
  if (node.metadata?.serverAction === true) return false;
  if (node.kind !== "function" && node.kind !== "hook") return false;
  for (const item of node.evidence) {
    const file = normalizePath(item.file);
    if (/(^|\/)apis\//.test(file)) return true;
  }
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  if (parent?.kind === "module" && /(^|\/)apis\//.test(modulePath(parent))) {
    return true;
  }
  return false;
}

/**
 * FE story edges from pages (deterministic, evidence-backed):
 * - `renders` page atom → page-owned feature root (lifted from page-body JSX)
 * - `reads`/`writes` page molecule → API when a owned feature root calls a
 *   server action nested under the API system
 * - `reads`/`writes` page molecule → API when a owned feature root calls a
 *   client `apis/**` helper (Next/SaaS axios/fetch wrappers)
 */
function liftFePageStoryEdges(
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  systems: Map<string, ArchitectureNode>,
): void {
  const api = systems.get("api");

  // page body component id → owning page atom
  const pageBodyToPage = new Map<string, string>();
  for (const node of nodes.values()) {
    if (node.kind !== "component" || !node.parentId) continue;
    const parent = nodes.get(node.parentId);
    if (parent?.kind === "page") {
      pageBodyToPage.set(node.id, parent.id);
    }
  }

  // Lift JSX renders onto the page atom so the catalog edge is page→feature.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "renders") continue;
    const pageId = pageBodyToPage.get(edge.source);
    if (!pageId) continue;
    const target = nodes.get(edge.target);
    if (!target || target.kind !== "component") continue;
    if (target.metadata?.featureRoot !== true) continue;
    const page = nodes.get(pageId);
    if (!page) continue;
    const seed = edge.evidence[0]!;
    const lifted = edgeFrom(
      "renders",
      pageId,
      target.id,
      {
        ...seed,
        extractor: "projection",
        certainty: "derived",
        detail:
          seed.detail ??
          `${page.label} page renders feature root ${target.label}`,
      },
      edge.label,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
  }

  if (!api) return;

  const liftMoleculeApiStory = (
    source: ArchitectureNode,
    target: ArchitectureNode,
    seed: Evidence,
    via: string,
  ): void => {
    const moleculeKey =
      typeof source.metadata?.routeMolecule === "string"
        ? source.metadata.routeMolecule
        : typeof source.metadata?.projectedSystem === "string" &&
            String(source.metadata.projectedSystem).startsWith("page:")
          ? String(source.metadata.projectedSystem)
          : undefined;
    if (!moleculeKey) return;
    const molecule = systems.get(moleculeKey);
    if (!molecule) return;

    const targetLabel = humanizeIdentifierLabel(target.label);
    const kind = serverActionStoryEdgeKind(targetLabel);
    const lifted = edgeFrom(
      kind,
      molecule.id,
      api.id,
      {
        ...seed,
        extractor: "projection",
        certainty: "derived",
        detail: `${molecule.label} ${kind} ${api.label} via ${source.label} → ${targetLabel} (${via})`,
      },
      targetLabel,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
  };

  // Page molecule → API reads/writes from featureRoot → serverAction calls.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "calls") continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (source.metadata?.featureRoot !== true) continue;
    if (target.metadata?.serverAction !== true) continue;
    if (target.parentId !== api.id) continue;
    liftMoleculeApiStory(
      source,
      target,
      edge.evidence[0]!,
      "server action",
    );
  }

  // Page molecule → API from featureRoot → client `apis/**` helpers.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "calls") continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (source.metadata?.featureRoot !== true) continue;
    if (!isClientApiFunction(target, nodes)) continue;
    liftMoleculeApiStory(
      source,
      target,
      edge.evidence[0]!,
      "client apis module",
    );
  }
}

/** Walk parentId until a semantic system/molecule hub. */
function semanticOwnerOf(
  nodeId: string,
  nodes: Map<string, ArchitectureNode>,
): ArchitectureNode | undefined {
  let current: string | undefined = nodeId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodes.get(current);
    if (!node) return undefined;
    if (node.metadata?.projection === "semantic") return node;
    current = node.parentId;
  }
  return undefined;
}

/**
 * BE story edges API/Jobs → Data + tables (deterministic, evidence-backed):
 * - When an API-owned function `reads`/`writes` a table under Data, lift the
 *   molecule edge (API→Data) and the table insight edge (API→table).
 * - When a Data-owned function does the Prisma I/O but an API function `calls`
 *   it (Checkout → fulfillOrder → Order), lift through that call bridge.
 * - When Jobs `schedules` a function that `reads`/`writes` Data, lift Jobs→Data
 *   and Jobs→table so Intermediate table focus answers “who writes this?”.
 */
function liftBeApiDataStoryEdges(
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  systems: Map<string, ArchitectureNode>,
): void {
  const api = systems.get("api");
  const data = systems.get("data");
  const jobs = systems.get("jobs");
  if (!data) return;

  const liftedKinds = new Set<string>();

  const addLifted = (
    kind: "reads" | "writes",
    from: ArchitectureNode,
    to: ArchitectureNode,
    viaCaller: ArchitectureNode | undefined,
    viaFn: ArchitectureNode,
    seed: Evidence,
  ): void => {
    const dedupeKey = `${kind}:${from.id}:${to.id}`;
    if (liftedKinds.has(dedupeKey)) return;
    const detail = viaCaller
      ? `${from.label} ${kind} ${to.label} via ${viaCaller.label} → ${viaFn.label}`
      : `${from.label} ${kind} ${to.label} via ${viaFn.label}`;
    const lifted = edgeFrom(
      kind,
      from.id,
      to.id,
      {
        ...seed,
        extractor: "projection",
        certainty: "derived",
        detail,
      },
      viaFn.label,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
    liftedKinds.add(dedupeKey);
  };

  const liftOwnerStory = (
    kind: "reads" | "writes",
    from: ArchitectureNode,
    table: ArchitectureNode,
    viaCaller: ArchitectureNode | undefined,
    viaFn: ArchitectureNode,
    seed: Evidence,
  ): void => {
    addLifted(kind, from, data, viaCaller, viaFn, seed);
    addLifted(kind, from, table, viaCaller, viaFn, seed);
  };

  for (const edge of [...edges.values()]) {
    if (edge.kind !== "reads" && edge.kind !== "writes") continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (target.kind !== "table" && target.kind !== "collection") continue;
    const tableOwner = semanticOwnerOf(target.id, nodes);
    if (!tableOwner || tableOwner.id !== data.id) continue;

    const sourceOwner = semanticOwnerOf(source.id, nodes);
    const seed = edge.evidence[0]!;

    // Direct: API-owned function touches a Data table.
    if (api && sourceOwner?.id === api.id) {
      liftOwnerStory(edge.kind, api, target, undefined, source, seed);
      continue;
    }

    // Bridge: API function calls a Data-owned reader/writer (mini-stack Checkout).
    if (api && sourceOwner?.id === data.id) {
      for (const call of edges.values()) {
        if (call.kind !== "calls") continue;
        if (call.target !== source.id) continue;
        const caller = nodes.get(call.source);
        if (!caller) continue;
        const callerOwner = semanticOwnerOf(caller.id, nodes);
        if (callerOwner?.id !== api.id) continue;
        liftOwnerStory(edge.kind, api, target, caller, source, seed);
        break;
      }
    }

    // Jobs schedule a function that reads/writes Data tables.
    if (jobs && (sourceOwner?.id === data.id || sourceOwner?.id === jobs.id)) {
      for (const sched of edges.values()) {
        if (sched.kind !== "schedules" && sched.kind !== "triggers") continue;
        if (sched.target !== source.id) continue;
        const scheduler = nodes.get(sched.source);
        if (!scheduler) continue;
        const schedulerOwner = semanticOwnerOf(scheduler.id, nodes);
        if (
          schedulerOwner?.id !== jobs.id &&
          scheduler.id !== jobs.id
        ) {
          continue;
        }
        liftOwnerStory(edge.kind, jobs, target, scheduler, source, seed);
        break;
      }
    }
  }
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
  // Bare `/api` → "GET API" (not a lonely verb).
  if (!segments.length) return `${verb} API`;
  // Sentence-case the path: Stripe checkout (not Stripe Checkout).
  // Keep product acronyms intact (AI, RAG, LLM) — never turn RAG into rAG.
  const humanPath = segments
    .map((segment, index) => {
      const human = humanizeIdentifierLabel(segment);
      if (index === 0) return human;
      if (/^[A-Z0-9]{2,}$/.test(human) || human === "OAuth") return human;
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

/**
 * Terraform resource/module addresses → North-star Deploy labels.
 * `aws_s3_bucket.notes` → `Notes · S3 bucket`; `module.network` → `Network`.
 * Singleton names (`this`) are HCL chrome — drop them so `aws_vpc.this` → `VPC`.
 */
export function humanizeTerraformLabel(
  kind: "resource" | "module",
  type: string,
  name?: string,
): string {
  if (kind === "module") {
    return humanizeIdentifierLabel(type);
  }
  const withoutProvider = type.replace(
    /^(aws|google|azurerm|azuread|digitalocean|helm|kubernetes|random|null|local|tls|archive|time|external|cloudflare|vercel)_/i,
    "",
  );
  const typeLabel = humanizeIdentifierLabel(withoutProvider);
  const rawName = name?.trim();
  // `resource "aws_vpc" "this"` — "this" is the Terraform singleton idiom,
  // not a product word founders should read on the canvas.
  if (!rawName || /^this$/i.test(rawName)) {
    return typeLabel;
  }
  return `${humanizeIdentifierLabel(rawName)} · ${typeLabel}`;
}

/**
 * Kubernetes resources → North-star Deploy labels.
 * `Deployment/api` → `API · Deployment`; `Ingress/notes` → `Notes · Ingress`.
 * Ingress hosts become canvas vocabulary like Compose ports
 * (`Notes · notes.example.com`) so founders read where traffic lands.
 * Compound microservice names (`cartservice`) become camelCase before humanize
 * so `adservice` → `Ad service` (space early-return must not skip title case).
 */
/**
 * Split all-lowercase glued K8s names into camelCase via a product lexicon.
 * `productcatalogservice` → `productCatalogService`, `loadgenerator` →
 * `loadGenerator`. Names that already have hyphens/underscores/camelCase (or
 * cannot be fully segmented) keep the trailing-`service` split only.
 */
export function splitGluedKubernetesName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  // Hyphen / underscore / existing camelCase already humanize cleanly.
  if (/[-_]/.test(trimmed) || /[a-z][A-Z]/.test(trimmed)) {
    return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
  }
  const lower = trimmed.toLowerCase();
  // Only attempt lexicon splits on plain glued identifiers.
  if (!/^[a-z][a-z0-9]*$/.test(lower)) {
    return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
  }
  const parts: string[] = [];
  let i = 0;
  while (i < lower.length) {
    let matched: string | undefined;
    for (const word of KUBERNETES_NAME_SEGMENTS) {
      if (lower.startsWith(word, i)) {
        matched = word;
        break;
      }
    }
    if (!matched) {
      // Incomplete lexicon coverage — fall back to service-suffix split.
      return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
    }
    parts.push(matched);
    i += matched.length;
  }
  if (parts.length <= 1) {
    return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
  }
  return parts
    .map((part, index) =>
      index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}

export function humanizeKubernetesLabel(
  kind: string,
  name: string,
  hosts?: string[],
): string {
  const base = humanizeIdentifierLabel(splitGluedKubernetesName(name));
  if (kind === "Ingress") {
    const host = hosts?.find((item) => typeof item === "string" && item.trim());
    if (host) return `${base} · ${host.trim()}`;
  }
  return `${base} · ${kind}`;
}

/** Example/wrapper TF paths are sample chrome, not the module's product surface. */
function isTerraformExampleChromePath(file: string): boolean {
  return /(^|\/)(examples|wrappers)(\/|$)/i.test(normalizePath(file));
}

/**
 * Boutique-style `kustomize/components/` patches beside kubernetes-manifests.
 * Product trees under `kustomize/bases` / `kustomize/overlays` are not chrome.
 */
function isKustomizeChromePath(file: string): boolean {
  return /(^|\/)kustomize\/components\//i.test(normalizePath(file));
}

/**
 * Hide kustomize/ overlay workloads from the default browser (Details still
 * searchable) when a primary kubernetes-manifests (or other non-kustomize)
 * Deploy story already exists. Kustomize-led apps (only overlay trees) keep
 * Overlay hubs + resources as the product Deploy story.
 */
function quietKustomizeChrome(nodes: Map<string, ArchitectureNode>): void {
  const hasPrimaryKubernetesUnits = [...nodes.values()].some((node) => {
    if (node.metadata?.kubernetesResource !== true) return false;
    const file = normalizePath(
      String(
        node.evidence?.[0]?.file ??
          node.metadata?.file ??
          node.label ??
          "",
      ),
    );
    // Workloads under kustomize/bases|overlays are the overlay story itself —
    // only kubernetes-manifests (or similar) outside `kustomize/` count as primary.
    if (/(^|\/)kustomize\//i.test(file)) return false;
    return (
      node.metadata?.kustomizeChrome !== true && !isKustomizeChromePath(file)
    );
  });
  // Without a primary manifests story, kustomize/ IS the Deploy surface.
  if (!hasPrimaryKubernetesUnits) return;

  for (const node of nodes.values()) {
    if (
      node.metadata?.kubernetes !== true &&
      node.metadata?.kustomize !== true
    ) {
      continue;
    }
    const file = normalizePath(
      String(
        node.evidence?.[0]?.file ??
          node.metadata?.file ??
          node.label ??
          "",
      ),
    );
    // Beside kubernetes-manifests, any `kustomize/` tree is packaging chrome
    // (components/ and overlay indexes). Product-only trees never reach here.
    const underKustomizeProductTree = /(^|\/)kustomize\//i.test(file);
    if (
      node.metadata?.kustomizeChrome !== true &&
      !isKustomizeChromePath(file) &&
      !underKustomizeProductTree
    ) {
      continue;
    }
    node.metadata = {
      ...node.metadata,
      kustomizeChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }
}

/**
 * kustomization.yaml modules restate Overlay service nodes. Mark them
 * exampleChrome so the North-star cold-read shows Notes · Overlay, not the
 * packaging file path.
 */
function quietKustomizeModuleTwinChrome(
  nodes: Map<string, ArchitectureNode>,
): void {
  const overlayNames = new Set<string>();
  for (const node of nodes.values()) {
    if (node.kind !== "service" || node.metadata?.kustomize !== true) continue;
    if (node.metadata?.exampleChrome === true) continue;
    const overlayName = node.metadata?.overlayName;
    if (node.metadata?.kustomization === true && typeof overlayName === "string") {
      overlayNames.add(overlayName);
    }
  }
  if (overlayNames.size === 0) return;

  for (const node of nodes.values()) {
    if (node.kind !== "module" || node.metadata?.kustomize !== true) continue;
    if (node.metadata?.exampleChrome === true) continue;
    const overlayName = node.metadata?.overlayName;
    if (typeof overlayName !== "string" || !overlayNames.has(overlayName)) {
      continue;
    }
    node.metadata = {
      ...node.metadata,
      kustomizeModuleTwinChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }
}

/**
 * kustomization.yaml sitting inside kubernetes-manifests/k8s/manifests is an
 * index twin of the concrete Deployments/Services already on the map (Online
 * Boutique). Quiet those Overlay hubs so workloads own the cold-read; pure
 * overlay-led trees (mini-kustomize) keep their Overlay hubs.
 */
function quietManifestIndexOverlayChrome(
  nodes: Map<string, ArchitectureNode>,
): void {
  const hasConcreteWorkloads = [...nodes.values()].some(
    (node) =>
      node.metadata?.kubernetesResource === true &&
      node.metadata?.kustomizeChrome !== true,
  );
  if (!hasConcreteWorkloads) return;

  for (const node of nodes.values()) {
    if (node.metadata?.kustomization !== true && node.metadata?.kustomizeModule !== true) {
      continue;
    }
    if (node.metadata?.exampleChrome === true) continue;
    const file = normalizePath(
      String(
        node.evidence?.[0]?.file ??
          node.metadata?.file ??
          node.label ??
          "",
      ),
    );
    // Only quiet indexes inside primary manifest trees — not kustomize/ overlays.
    if (isKustomizeChromePath(file)) continue;
    if (
      !/(^|\/)(k8s|kubernetes)(-?manifests?)?(\/|$)/i.test(file) &&
      !/(^|\/)manifests?(\/|$)/i.test(file)
    ) {
      continue;
    }
    node.metadata = {
      ...node.metadata,
      kustomizeModuleTwinChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }
}

/**
 * Nest kubernetes Deployments/Services/Ingress under the Base/Overlay hub
 * whose `overlayRoot` owns the manifest path. Longest prefix wins so
 * `deploy/bases/backend/deployment.yaml` → Backend · Base, not a parent tree.
 * Resources outside any hub (podinfo `deploy/webapp/`) stay under Deploy.
 */
function nestKubernetesUnderKustomizeHubs(
  nodes: Map<string, ArchitectureNode>,
  attachToSystem: (
    nodeId: string,
    systemId: string,
    evidence: Evidence,
  ) => void,
): void {
  const hubs = [...nodes.values()]
    .filter((node) => {
      if (node.kind !== "service" || node.metadata?.kustomization !== true) {
        return false;
      }
      if (
        node.metadata?.kustomizeChrome === true ||
        node.metadata?.exampleChrome === true
      ) {
        return false;
      }
      const root = normalizePath(String(node.metadata?.overlayRoot ?? ""));
      if (!root) return false;
      // Boutique-style manifest-index kustomizations
      // (`kubernetes-manifests/kustomization.yaml`) are not product Base/Overlay
      // owners — leave workloads nested under Deploy for the cold-read.
      if (
        /(^|\/)(k8s|kubernetes)(-?manifests?)?(\/|$)/i.test(root) ||
        /(^|\/)manifests?(\/|$)/i.test(root)
      ) {
        return false;
      }
      return true;
    })
    .map((node) => ({
      id: node.id,
      root: normalizePath(String(node.metadata!.overlayRoot)),
    }))
    .sort((a, b) => b.root.length - a.root.length);
  if (hubs.length === 0) return;

  for (const node of [...nodes.values()]) {
    if (node.metadata?.kubernetesResource !== true) continue;
    const file = normalizePath(node.evidence[0]?.file ?? "");
    if (!file) continue;
    const hub = hubs.find(
      (entry) => file === entry.root || file.startsWith(`${entry.root}/`),
    );
    if (!hub) continue;
    attachToSystem(
      node.id,
      hub.id,
      node.evidence[0] ?? projectionEvidence("."),
    );
    // Hubs are not semantic systems, so the semantic-parent collapse pass
    // never sees these leaves — collapse them so only Base/Overlay hubs
    // remain on the North-star cold-read.
    const nested = nodes.get(node.id);
    if (!nested) continue;
    nested.metadata = {
      ...nested.metadata,
      collapsedInOverview: true,
    };
    nodes.set(nested.id, nested);
  }
}

/**
 * Concrete Kustomize Overlay hubs are the Deploy story for overlay-led repos.
 * Keep them as overview hubs beside Deploy — Boutique kustomize/components
 * beside kubernetes-manifests stay quiet via exampleChrome.
 */
function promoteKustomizeOverviewHubs(
  nodes: Map<string, ArchitectureNode>,
): void {
  for (const node of nodes.values()) {
    if (node.kind !== "service" || node.metadata?.kustomize !== true) continue;
    if (node.metadata?.exampleChrome === true) continue;
    if (node.metadata?.kustomization !== true) continue;
    node.metadata = {
      ...node.metadata,
      overviewHub: true,
      collapsedInOverview: false,
    };
    nodes.set(node.id, node);
  }
}

/**
 * Helm Chart.yaml with only `{{ .Values }}` template names is honest surface
 * when charts are the deploy story — but beside kubernetes-manifests it restates
 * packaging chrome (Online Boutique Chart/onlineboutique). Quiet those
 * Chart-only nodes so Deploy stays manifests-led; searchable via Details.
 */
function quietHelmChartOnlyChrome(
  nodes: Map<string, ArchitectureNode>,
): void {
  const hasKubernetesUnits = [...nodes.values()].some(
    (node) => node.metadata?.kubernetesResource === true,
  );
  if (!hasKubernetesUnits) return;

  const chartsWithConcreteResources = new Set<string>();
  for (const node of nodes.values()) {
    if (node.metadata?.helmResource !== true) continue;
    const chartName = node.metadata?.chartName;
    if (typeof chartName === "string" && chartName) {
      chartsWithConcreteResources.add(chartName);
    }
  }

  const quietChartNames = new Set<string>();
  for (const node of nodes.values()) {
    if (node.metadata?.helmChart !== true) continue;
    const chartName =
      typeof node.metadata?.chartName === "string"
        ? node.metadata.chartName
        : "";
    if (chartName && chartsWithConcreteResources.has(chartName)) continue;
    if (chartName) quietChartNames.add(chartName);
    node.metadata = {
      ...node.metadata,
      helmChartOnlyChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }

  if (quietChartNames.size === 0) return;

  // Chart.yaml modules for Values-only charts are the same chrome.
  for (const node of nodes.values()) {
    if (node.kind !== "module" || node.metadata?.helm !== true) continue;
    const chartName =
      typeof node.metadata?.chartName === "string"
        ? node.metadata.chartName
        : "";
    if (!chartName || !quietChartNames.has(chartName)) continue;
    node.metadata = {
      ...node.metadata,
      helmChartOnlyChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }
}

/**
 * Chart.yaml / templates/*.yaml modules restate Chart + Deployment/Service
 * service nodes. Mark them exampleChrome so the North-star cold-read shows
 * product labels (Hello world · Chart) without Chart twin module chrome.
 */
function quietHelmModuleTwinChrome(
  nodes: Map<string, ArchitectureNode>,
): void {
  const chartNamesWithChartNode = new Set<string>();
  const templateFilesWithResource = new Set<string>();
  for (const node of nodes.values()) {
    if (node.kind !== "service" || node.metadata?.helm !== true) continue;
    if (node.metadata?.exampleChrome === true) continue;
    const chartName =
      typeof node.metadata?.chartName === "string"
        ? node.metadata.chartName
        : "";
    if (node.metadata?.helmChart === true && chartName) {
      chartNamesWithChartNode.add(chartName);
    }
    if (node.metadata?.helmResource === true) {
      const file = normalizePath(
        String(node.evidence?.[0]?.file ?? node.metadata?.file ?? ""),
      );
      if (file) templateFilesWithResource.add(file);
    }
  }

  for (const node of nodes.values()) {
    if (node.kind !== "module" || node.metadata?.helm !== true) continue;
    if (node.metadata?.exampleChrome === true) continue;
    const file = normalizePath(
      String(node.metadata?.file ?? node.evidence?.[0]?.file ?? ""),
    );
    const chartName =
      typeof node.metadata?.chartName === "string"
        ? node.metadata.chartName
        : "";
    const isChartYamlTwin =
      Boolean(chartName) &&
      chartNamesWithChartNode.has(chartName) &&
      /\/chart\.ya?ml$/i.test(file);
    const isTemplateTwin =
      Boolean(file) && templateFilesWithResource.has(file);
    if (!isChartYamlTwin && !isTemplateTwin) continue;
    node.metadata = {
      ...node.metadata,
      helmModuleTwinChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }
}

/**
 * Concrete Helm Chart + template resources are the Deploy story for chart-led
 * repos (helm/examples Hello world). Keep them as overview hubs beside Deploy
 * — Chart-only chrome beside kubernetes-manifests stays quiet via exampleChrome.
 */
function promoteHelmOverviewHubs(
  nodes: Map<string, ArchitectureNode>,
): void {
  for (const node of nodes.values()) {
    if (node.kind !== "service" || node.metadata?.helm !== true) continue;
    if (node.metadata?.exampleChrome === true) continue;
    if (
      node.metadata?.helmChart !== true &&
      node.metadata?.helmResource !== true
    ) {
      continue;
    }
    node.metadata = {
      ...node.metadata,
      overviewHub: true,
      collapsedInOverview: false,
    };
    nodes.set(node.id, node);
  }
}

/**
 * Product Kustomize Overlay hubs (deploy/bases + overlays) own the cold-read
 * for overlay-led repos (podinfo). Concrete Helm Chart/Deployments beside those
 * overlays restate packaging — quiet them like Chart-only chrome beside
 * kubernetes-manifests. Chart-led maps without product overlays keep Helm hubs.
 */
function quietHelmBesideKustomizeOverlays(
  nodes: Map<string, ArchitectureNode>,
): void {
  const hasProductOverlays = [...nodes.values()].some(
    (node) =>
      node.metadata?.kustomization === true &&
      node.metadata?.exampleChrome !== true &&
      node.metadata?.kustomizeChrome !== true,
  );
  if (!hasProductOverlays) return;

  for (const node of nodes.values()) {
    const isHelmSurface =
      node.metadata?.helmChart === true ||
      node.metadata?.helmResource === true ||
      (node.kind === "module" && node.metadata?.helm === true);
    if (!isHelmSurface) continue;
    if (node.metadata?.exampleChrome === true) continue;
    node.metadata = {
      ...node.metadata,
      helmBesideOverlayChrome: true,
      exampleChrome: true,
      collapsedInOverview: true,
      overviewHub: false,
    };
    nodes.set(node.id, node);
  }
}

/** Regression-fixture / GitHub-issue sample modules (`vpc_issue_44`, …). */
function isTerraformIssueModuleName(name: string): boolean {
  return /_issue_/i.test(name);
}

/**
 * Hide examples/ + wrappers/ + `*_issue_*` Terraform chrome from the default
 * browser (Details still searchable). Root resources + real `modules/` stay.
 */
function quietTerraformExampleChrome(
  nodes: Map<string, ArchitectureNode>,
): void {
  for (const node of nodes.values()) {
    if (node.metadata?.terraform !== true) continue;
    if (node.metadata?.terraformResource === true) continue;

    const file = normalizePath(
      String(
        node.evidence?.[0]?.file ??
          node.metadata?.file ??
          node.label ??
          "",
      ),
    );

    if (node.metadata?.terraformModuleBlock === true) {
      const moduleName = String(node.metadata.moduleName ?? "");
      if (
        isTerraformExampleChromePath(file) ||
        isTerraformIssueModuleName(moduleName)
      ) {
        node.metadata = {
          ...node.metadata,
          exampleChrome: true,
        };
        nodes.set(node.id, node);
      }
      continue;
    }

    if (
      node.kind === "module" &&
      node.metadata?.terraformModule === true &&
      isTerraformExampleChromePath(file)
    ) {
      node.metadata = {
        ...node.metadata,
        exampleChrome: true,
      };
      nodes.set(node.id, node);
    }
  }
}

function isSqlFamilyTable(node: ArchitectureNode): boolean {
  return (
    node.technology === "sql" ||
    node.technology === "alembic" ||
    node.technology === "sqlalchemy"
  );
}

function isMongoCollection(node: ArchitectureNode): boolean {
  return (
    node.kind === "collection" &&
    (node.technology === "mongoose" || node.technology === "mongodb")
  );
}

/** SCREAMING_SNAKE const names used as `.collection(CONST)` args. */
function isScreamingSnakeBinding(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(name);
}

/**
 * Collection-handle crumbs that become junk overview hubs
 * (`C pipeline`, `Col pipeline`) on foreign Mongo apps (Shree Heart).
 * Real product stems (Note, Search chunks, Tag) stay.
 */
const TRIVIAL_MONGO_AGGREGATE_HANDLES = new Set([
  "c",
  "col",
  "coll",
  "cols",
  "colls",
  "doc",
  "docs",
  "row",
  "rows",
  "cur",
  "cursor",
  "agg",
  "tmp",
  "temp",
  "res",
  "obj",
  "arr",
  "val",
  "item",
  "items",
  "data",
  "db",
  "rec",
  "recs",
  "ent",
  "ents",
  "mod",
  "model",
  "models",
  "schema",
]);

/**
 * True when a mongo aggregate pipeline label is a short variable/handle crumb
 * rather than a product collection story (Shree Heart field gate).
 */
export function isTrivialMongoAggregateLabel(label: string): boolean {
  const stem = label.replace(/\s+pipeline$/i, "").trim();
  if (!stem) return true;
  const compact = stem.replace(/\s+/g, "");
  if (/^[A-Za-z]$/.test(compact)) return true;
  if (TRIVIAL_MONGO_AGGREGATE_HANDLES.has(compact.toLowerCase())) return true;
  // Two-letter alpha crumbs (cx, tx) — keep known product acronyms (AI, DB).
  if (
    /^[A-Za-z]{2}$/.test(compact) &&
    !PRODUCT_ACRONYMS.has(compact.toLowerCase())
  ) {
    return true;
  }
  return false;
}

function preferredCollectionLabel(bucket: ArchitectureNode[]): string {
  const ranked = [...bucket].sort((a, b) => {
    const rankDiff = collectionRank(b) - collectionRank(a);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
  const best = ranked[0]!;
  // mongoose.model("Note") already carries the product word.
  if (
    best.technology === "mongoose" &&
    !best.metadata?.discoveredFromUsage &&
    /^[A-Z]/.test(best.label)
  ) {
    return best.label;
  }
  // Prefer RAG_CHUNKS → "RAG chunks" over rag_chunks → "Rag chunk".
  const binding = ranked
    .map((node) => node.metadata?.bindingName)
    .find(
      (name): name is string =>
        typeof name === "string" && isScreamingSnakeBinding(name),
    );
  if (binding) return humanizeIdentifierLabel(binding);
  const raw =
    (typeof best.metadata?.collectionName === "string"
      ? best.metadata.collectionName
      : best.label) ?? best.label;
  return titleCaseSingular(String(raw));
}

function collectionRank(node: ArchitectureNode): number {
  if (node.technology === "mongoose" && !node.metadata?.discoveredFromUsage) {
    return /^[A-Z]/.test(node.label) ? 3 : 2;
  }
  if (node.technology === "mongodb" && !node.metadata?.discoveredFromUsage) {
    return 2;
  }
  if (node.metadata?.discoveredFromUsage) return 1;
  return 0;
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

  // OpenAPI/Swagger specs carry the real product name when the README is
  // sample/demo boilerplate ("Swagger Petstore Sample"). Skip docs chrome
  // titles ("API Documentation") — those are not a product brand.
  const openapiInfoTitle = [...nodes.values()]
    .map((node) =>
      node.metadata?.openapiSpec === true &&
      typeof node.metadata.openapiTitle === "string"
        ? cleanOpenApiInfoTitle(node.metadata.openapiTitle)
        : undefined,
    )
    .find(
      (title) =>
        title && title.length > 0 && !isGenericApiDocsTitle(title),
    );

  // Prefer a cleaned README H1 when package.json name is scoped/non-descriptive.
  // When README is sample boilerplate and an OpenAPI info.title exists, prefer
  // the contract title (North-star brand over "… Sample" docs chrome).
  if (
    openapiInfoTitle &&
    options.readmeTitle &&
    isSampleBoilerplateTitle(options.readmeTitle)
  ) {
    if (openapiInfoTitle !== product.label) {
      product.metadata = {
        ...product.metadata,
        ...(product.label !== openapiInfoTitle
          ? { packageName: product.label }
          : {}),
        labelSource: "openapi",
        openapiTitle: openapiInfoTitle,
        ...(options.readmeTitle ? { readmeTitle: options.readmeTitle } : {}),
      };
      product.label = openapiInfoTitle;
      const specFile =
        [...nodes.values()].find(
          (node) =>
            node.metadata?.openapiSpec === true &&
            typeof node.metadata.openapiTitle === "string",
        )?.qualifiedName ??
        [...nodes.values()].find((node) => node.metadata?.openapiSpec === true)
          ?.label ??
        "openapi.yaml";
      product.evidence = dedupeEvidence([
        ...product.evidence,
        projectionEvidence(
          String(specFile),
          `Product label from OpenAPI info.title "${openapiInfoTitle}" (README was sample boilerplate)`,
        ),
      ]);
      nodes.set(product.id, product);
    }
  } else if (options.readmeTitle) {
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

  // Nest Docker / Terraform / Kubernetes / Helm / Kustomize units under Deploy
  // so the overview tells a containers/infra/workloads/charts/overlays story.
  const deploySystem = systems.get("deploy");
  if (deploySystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind !== "service") continue;
      if (
        node.metadata?.docker !== true &&
        node.metadata?.terraform !== true &&
        node.metadata?.kubernetes !== true &&
        node.metadata?.helm !== true &&
        node.metadata?.kustomize !== true
      ) {
        continue;
      }
      if (node.metadata?.projection === "semantic") continue;
      // Extractor roster children under Extractors are also kind:service — skip.
      if (node.metadata?.role === "extractor") continue;
      attachToSystem(
        node.id,
        deploySystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }

    // Path-link kubernetes resources under owning Base/Overlay hubs
    // (Backend · Base owns deploy/bases/backend/*). Longest overlayRoot wins.
    nestKubernetesUnderKustomizeHubs(nodes, attachToSystem);
  }

  // Nest extracted pipelines under the semantic Pipelines system.
  // Mongo aggregation pipelines stay out — they nest under Data access so we
  // never invent a Pipelines system that would gate Checkout commerce collab.
  const pipelinesSystem = systems.get("pipelines");
  if (pipelinesSystem) {
    for (const node of [...nodes.values()]) {
      if (
        node.kind === "pipeline" &&
        node.metadata?.projection !== "semantic" &&
        node.metadata?.mongoAggregate !== true &&
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
    "service",
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
    // Only collapse Docker/Terraform/Kubernetes/Helm/Kustomize deployables —
    // Extractor roster stays.
    if (
      node.kind === "service" &&
      node.metadata?.docker !== true &&
      node.metadata?.terraform !== true &&
      node.metadata?.kubernetes !== true &&
      node.metadata?.helm !== true &&
      node.metadata?.kustomize !== true &&
      node.metadata?.role !== "extractor"
    ) {
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

  // FE atom catalog: mark page-owned feature roots vs leaf presentational chrome
  // (Card/Button/stories). Intermediate shows feature roots; Advanced keeps leaves.
  markFeFeatureRootsAndLeafChrome(nodes, graph);

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

    if (
      node.kind === "page" &&
      (node.metadata?.next === "page" ||
        node.metadata?.vue === "page" ||
        node.metadata?.framework === "vue")
    ) {
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
      node.metadata?.openapi === true &&
      typeof node.metadata?.summary === "string" &&
      node.metadata.summary.trim()
    ) {
      // OpenAPI/Swagger summaries are already product vocabulary ("List notes").
      // Prefer them over path-derived labels so list vs detail stay distinct;
      // strip trailing periods so canvas labels aren't sentence chrome.
      nextLabel = humanizeOpenApiSummaryLabel(node.metadata.summary);
    } else if (
      node.kind === "route" &&
      node.metadata?.graphql === true &&
      typeof node.metadata?.operationType === "string" &&
      typeof node.metadata?.field === "string"
    ) {
      // GraphQL: SDL keeps Query/Mutation + field; named documents use the
      // operation name alone so CreateNote ≠ Mutation Create note on canvas.
      const sourceKind =
        node.metadata.sourceKind === "gql" || node.metadata.sourceKind === "sdl"
          ? node.metadata.sourceKind
          : undefined;
      nextLabel = humanizeGraphqlOperationLabel(
        node.metadata.operationType,
        node.metadata.field,
        {
          ...(sourceKind ? { sourceKind } : {}),
          ...(typeof node.metadata.operationName === "string"
            ? { operationName: node.metadata.operationName }
            : {}),
        },
      );
    } else if (
      node.kind === "route" &&
      typeof node.metadata?.path === "string" &&
      (node.metadata?.next === "route" ||
        node.metadata?.framework === "fastapi" ||
        node.metadata?.framework === "django" ||
        node.metadata?.openapi === true ||
        node.metadata.path.startsWith("/api/") ||
        node.metadata.path === "/api")
    ) {
      // Next/FastAPI/Django/OpenAPI (+ /api/*): GET /api/articles/{slug} → GET Articles.
      const method =
        typeof node.metadata.method === "string" ? node.metadata.method : "GET";
      nextLabel = humanizeHttpRouteLabel(method, node.metadata.path);
    } else if (node.metadata?.serverAction === true) {
      // checkoutAction → Checkout (drop trailing Action factory chrome).
      nextLabel = humanizeServerActionLabel(node.label);
    } else if (
      (node.kind === "function" || node.kind === "hook") &&
      isClientApiFunction(node, nodes)
    ) {
      // Client apis/** helpers: listPosts → List posts (same vocabulary as actions).
      nextLabel = humanizeIdentifierLabel(node.label);
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
      // Celery/node-cron: send_digest (0 * * * *) → Send digest (every hour)
      const when = humanizeCronExpression(node.metadata.expression);
      nextLabel = `${humanizeIdentifierLabel(node.metadata.handler)} (${when})`;
    } else if (node.kind === "component") {
      // All components (client + server): tame PascalCase Card*/skeletons too.
      nextLabel = humanizeIdentifierLabel(node.label);
    } else if (
      node.kind === "service" &&
      node.metadata?.docker === true &&
      typeof node.metadata?.serviceName === "string"
    ) {
      // Compose service ids: api → API, web → Web; published ports become
      // North-star canvas vocabulary (Vote · 8080) like cron schedule phrases.
      const base = humanizeIdentifierLabel(node.metadata.serviceName);
      const hostPorts = Array.isArray(node.metadata.hostPorts)
        ? node.metadata.hostPorts.filter(
            (port): port is string => typeof port === "string" && Boolean(port),
          )
        : [];
      // Prefer the primary published port; skip debugger twin ports (9229…).
      const storyPort = hostPorts.find((port) => !/^9\d{3}$/.test(port));
      nextLabel = storyPort ? `${base} · ${storyPort}` : base;
    } else if (
      node.kind === "service" &&
      node.metadata?.terraformResource === true &&
      typeof node.metadata?.resourceType === "string"
    ) {
      // aws_s3_bucket.notes → Notes · S3 bucket
      nextLabel = humanizeTerraformLabel(
        "resource",
        node.metadata.resourceType,
        typeof node.metadata.resourceName === "string"
          ? node.metadata.resourceName
          : undefined,
      );
    } else if (
      node.kind === "service" &&
      node.metadata?.terraformModuleBlock === true &&
      typeof node.metadata?.moduleName === "string"
    ) {
      // module.network → Network
      nextLabel = humanizeTerraformLabel("module", node.metadata.moduleName);
    } else if (
      node.kind === "service" &&
      node.metadata?.kubernetesResource === true &&
      typeof node.metadata?.k8sKind === "string" &&
      typeof node.metadata?.resourceName === "string"
    ) {
      // Deployment/api → API · Deployment; Ingress/notes → Notes · host
      const hosts = Array.isArray(node.metadata.hosts)
        ? node.metadata.hosts.filter(
            (host): host is string => typeof host === "string" && Boolean(host),
          )
        : undefined;
      nextLabel = humanizeKubernetesLabel(
        node.metadata.k8sKind,
        node.metadata.resourceName,
        hosts,
      );
    } else if (
      node.kind === "service" &&
      node.metadata?.helmChart === true &&
      typeof node.metadata?.chartName === "string"
    ) {
      // Chart/notes → Notes · Chart
      nextLabel = `${humanizeIdentifierLabel(node.metadata.chartName)} · Chart`;
    } else if (
      node.kind === "service" &&
      node.metadata?.helmResource === true &&
      typeof node.metadata?.k8sKind === "string" &&
      typeof node.metadata?.resourceName === "string"
    ) {
      // Helm template Deployment/api → API · Deployment (same canvas vocabulary).
      const hosts = Array.isArray(node.metadata.hosts)
        ? node.metadata.hosts.filter(
            (host): host is string => typeof host === "string" && Boolean(host),
          )
        : undefined;
      nextLabel = humanizeKubernetesLabel(
        node.metadata.k8sKind,
        node.metadata.resourceName,
        hosts,
      );
    } else if (
      node.kind === "service" &&
      node.metadata?.kustomization === true &&
      typeof node.metadata?.overlayName === "string"
    ) {
      // Base/backend → Backend · Base; Overlay/notes → Notes · Overlay
      const roleLabel =
        node.metadata?.kustomizeRole === "base" ? "Base" : "Overlay";
      nextLabel = `${humanizeIdentifierLabel(node.metadata.overlayName)} · ${roleLabel}`;
    }

    if (!nextLabel || nextLabel === node.label) continue;
    node.metadata = {
      ...node.metadata,
      technicalLabel: node.label,
    };
    node.label = nextLabel;
    nodes.set(node.id, node);
  }

  // FE molecules: Home `/`, Dashboard `/dashboard`, … — Beginner route hubs.
  projectFeRouteSegmentMolecules(
    systems,
    nodes,
    edges,
    product.id,
    attachToSystem,
  );

  // FE story edges: page -[renders]-> feature roots; page molecule
  // -[reads|writes]-> API from static featureRoot → server-action calls.
  liftFePageStoryEdges(nodes, edges, systems);

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

  // Collapse duplicate Mongo collections (Note / notes) and nest under Data.
  const collectionsByKey = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (!isMongoCollection(node)) continue;
    const key = normalizeTableKey(
      typeof node.metadata?.collectionName === "string"
        ? node.metadata.collectionName
        : node.label,
    );
    const bucket = collectionsByKey.get(key) ?? [];
    bucket.push(node);
    collectionsByKey.set(key, bucket);
  }

  const collectionRedirect = new Map<string, string>();
  for (const [key, bucket] of collectionsByKey) {
    const ranked = [...bucket].sort((a, b) => {
      const rankDiff = collectionRank(b) - collectionRank(a);
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = ranked[0]!;
    const aliases = [
      ...new Set(
        ranked
          .map((node) => node.label)
          .filter((label) => label !== preferredCollectionLabel(ranked)),
      ),
    ];
    const collectionName =
      ranked.find(
        (node) => typeof node.metadata?.collectionName === "string",
      )?.metadata?.collectionName ??
      (typeof canonical.metadata?.collectionName === "string"
        ? canonical.metadata.collectionName
        : undefined);
    const sources = [
      ...new Set(
        ranked
          .map((node) => node.technology)
          .filter((tech): tech is string => Boolean(tech)),
      ),
    ];
    canonical.label = preferredCollectionLabel(ranked);
    canonical.metadata = {
      ...canonical.metadata,
      aliases,
      normalizedTable: key,
      ...(collectionName ? { collectionName: String(collectionName) } : {}),
      sources,
    };
    for (const duplicate of ranked.slice(1)) {
      for (const child of nodes.values()) {
        if (child.parentId === duplicate.id) {
          child.parentId = canonical.id;
          nodes.set(child.id, child);
        }
      }
      collectionRedirect.set(duplicate.id, canonical.id);
      canonical.evidence.push(...duplicate.evidence);
      nodes.delete(duplicate.id);
    }
    canonical.evidence = dedupeEvidence(canonical.evidence);
    nodes.set(canonical.id, canonical);
  }

  if (collectionRedirect.size > 0) {
    for (const [edgeId, edge] of [...edges.entries()]) {
      const source = collectionRedirect.get(edge.source) ?? edge.source;
      const target = collectionRedirect.get(edge.target) ?? edge.target;
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
  }

  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (!isMongoCollection(node)) continue;
      attachToSystem(
        node.id,
        dataSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }

    const hasCollections = [...nodes.values()].some(
      (node) =>
        isMongoCollection(node) && node.parentId === dataSystem.id,
    );
    if (hasCollections) {
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

    // Mongo `.aggregate` pipelines are the RAG/query story beside collections.
    // Nest under Data access, humanize labels from the canonical collection,
    // and keep them visible on overview (pipeline-steps stay Details-only).
    const collectionsByNormalized = new Map<string, ArchitectureNode>();
    for (const node of nodes.values()) {
      if (!isMongoCollection(node)) continue;
      const key = normalizeTableKey(
        typeof node.metadata?.collectionName === "string"
          ? node.metadata.collectionName
          : node.label,
      );
      collectionsByNormalized.set(key, node);
      collectionsByNormalized.set(normalizeTableKey(node.label), node);
    }
    for (const node of [...nodes.values()]) {
      if (node.kind !== "pipeline" || node.metadata?.mongoAggregate !== true) {
        continue;
      }
      const binding =
        typeof node.metadata?.bindingName === "string"
          ? node.metadata.bindingName
          : undefined;
      const modelName =
        typeof node.metadata?.modelName === "string"
          ? node.metadata.modelName
          : undefined;
      const collectionName =
        typeof node.metadata?.collectionName === "string"
          ? node.metadata.collectionName
          : undefined;
      const matchKey = normalizeTableKey(
        collectionName ?? modelName ?? binding ?? node.label,
      );
      const collection =
        collectionsByNormalized.get(matchKey) ??
        (modelName
          ? collectionsByNormalized.get(normalizeTableKey(modelName))
          : undefined) ??
        (binding
          ? collectionsByNormalized.get(normalizeTableKey(binding))
          : undefined);
      const baseLabel = collection
        ? collection.label
        : binding && isScreamingSnakeBinding(binding)
          ? humanizeIdentifierLabel(binding)
          : modelName && /^[A-Z]/.test(modelName)
            ? modelName
            : humanizeIdentifierLabel(
                collectionName ?? modelName ?? binding ?? node.label,
              ).replace(/\s+pipeline$/i, "");
      const nextLabel = `${baseLabel} pipeline`;
      if (nextLabel !== node.label) {
        node.metadata = {
          ...node.metadata,
          technicalLabel: node.label,
        };
        node.label = nextLabel;
      }
      attachToSystem(
        node.id,
        dataSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
      // Junk handle crumbs (`C pipeline`, `Col pipeline`) stay off
      // Beginner/overview — real product aggregates remain overview hubs.
      const trivial = isTrivialMongoAggregateLabel(nextLabel);
      node.metadata = {
        ...node.metadata,
        ...(trivial
          ? {
              trivialMongoAggregate: true,
              overviewHub: false,
              collapsedInOverview: true,
            }
          : {
              overviewHub: true,
              collapsedInOverview: false,
            }),
      };
      nodes.set(node.id, node);
      // Stage leaves (Filter/Group/Sort) stay Details-only — the hub label
      // carries the aggregate story beside collections on overview.
      for (const step of nodes.values()) {
        if (step.kind !== "pipeline-step" || step.parentId !== node.id) continue;
        step.metadata = {
          ...step.metadata,
          collapsedInOverview: true,
        };
        nodes.set(step.id, step);
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
  const pageMoleculeKeys = [...systems.keys()]
    .filter((key) => key.startsWith("page:"))
    .sort((a, b) => a.localeCompare(b));
  const flowPairs: Array<[string, string]> = [...preferredFlows];
  if (systemsByKey.has("api")) {
    for (const pageKey of pageMoleculeKeys) {
      flowPairs.push([pageKey, "api"]);
    }
  }
  for (const [fromKey, toKey] of flowPairs) {
    const from = systemsByKey.get(fromKey);
    const to = systemsByKey.get(toKey);
    if (!from || !to) continue;
    // Aggregate UI→API flow stays in IR when UI is collapsed; page molecules
    // carry the visible Beginner band via their own flows-to edges.
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
  // Inferred API/Jobs → Data reads/uses may be replaced after README labels
  // once evidence-lifted reads/writes land (see liftBeApiDataStoryEdges).
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

  // Route molecules collaborate with HTTP API the same way aggregate UI did.
  if (systemsByKey.has("api") && pageMoleculeKeys.length) {
    const apiId = systemsByKey.get("api")!;
    for (const pageKey of pageMoleculeKeys) {
      const fromId = systemsByKey.get(pageKey);
      if (!fromId) continue;
      const molecule = systems.get(pageKey);
      const edge = edgeFrom(
        "uses",
        fromId,
        apiId,
        {
          file: ".",
          extractor: "projection",
          certainty: "inferred",
          detail: `${molecule?.label ?? pageKey} calls the HTTP API and server actions`,
        },
        "fetch",
      );
      if (!edges.has(edge.id)) edges.set(edge.id, edge);
    }
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

  // BE story edges after tables nest under Data + README labels: API/Jobs
  // -[reads|writes]-> Data from Prisma evidence + call/schedule bridges.
  liftBeApiDataStoryEdges(nodes, edges, systems);
  // Prefer derived API/Jobs → Data story edges over inferred collab twins.
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (
      edge.kind !== "reads" &&
      edge.kind !== "writes" &&
      edge.kind !== "uses"
    ) {
      continue;
    }
    if (!edge.evidence.some((item) => item.certainty === "inferred")) continue;
    const hasDerivedStory = [...edges.values()].some(
      (other) =>
        other.id !== edge.id &&
        other.source === edge.source &&
        other.target === edge.target &&
        (other.kind === "reads" || other.kind === "writes") &&
        other.evidence.some(
          (item) =>
            item.certainty === "derived" && item.extractor === "projection",
        ),
    );
    if (hasDerivedStory) edges.delete(edgeId);
  }

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

  // Quiet empty CLI / Schema-contract / table-less Data chrome, Dockerfile-only
  // Deploy, and thin/empty HTTP API beside Compose/Kubernetes/Helm/Kustomize
  // Deploy so product overviews stay story-led (API for GraphQL/OpenAPI;
  // Deploy for containers/k8s/charts/overlays).
  quietNonCompilerProductChrome(
    systems,
    nodes,
    edges,
    moduleToSystem,
    product.id,
  );

  // Terraform module repos ship examples/ + wrappers/ + vpc_issue_* samples that
  // restate the product under Deploy Details — hide like join-table chrome.
  quietTerraformExampleChrome(nodes);

  // Kustomize overlay components (otel / shopping-assistant) sit beside the
  // primary kubernetes-manifests story — quiet like Terraform examples.
  // Kustomize-led apps (no primary manifests) keep Overlay hubs visible.
  quietKustomizeChrome(nodes);

  // kustomization.yaml inside kubernetes-manifests/ is an index twin of the
  // concrete workloads — quiet so Deployments/Services own the cold-read.
  quietManifestIndexOverlayChrome(nodes);

  // Chart.yaml-only Helm (every template name is `{{ .Values }}`) beside
  // kubernetes-manifests is packaging chrome — quiet like kustomize overlays.
  quietHelmChartOnlyChrome(nodes);

  // Chart.yaml + templates/*.yaml modules twin the Chart/Deployment/Service
  // product nodes — quiet so Hello world labels own the cold-read.
  quietHelmModuleTwinChrome(nodes);

  // kustomization.yaml modules twin Overlay service nodes — quiet so
  // Notes · Overlay owns the cold-read.
  quietKustomizeModuleTwinChrome(nodes);

  // Concrete Helm Chart + resources stay visible beside Deploy (chart-led
  // North-star story). Skips exampleChrome Chart-only Boutique packaging.
  promoteHelmOverviewHubs(nodes);

  // Concrete Kustomize Overlay hubs stay visible beside Deploy (overlay-led
  // North-star story). Skips exampleChrome Boutique kustomize/components.
  promoteKustomizeOverviewHubs(nodes);

  // Overlay-led maps (podinfo deploy/bases+overlays): quiet Helm Chart hubs so
  // Overlays own the cold-read. Chart-led repos without product overlays keep hubs.
  quietHelmBesideKustomizeOverlays(nodes);

  // After chrome quieting (which drops edges to collapsed systems): hide the
  // aggregate UI blob so Beginner flowOrder is route molecules → API → …
  collapseAggregateUiBehindRouteMolecules(systems, nodes);

  // Foreign Next apps (shree-learn) can mint dozens of page molecules — keep
  // product hubs on Beginner; collapse marketing/excess for Intermediate/Find.
  compressFeBeginnerRouteMolecules(systems, nodes);

  // Heart / Express Intermediate calm: domain route groups + naked-route cap
  // so API focus is Users/Articles hubs (or ≤24 samples), not a route phonebook.
  projectApiRouteDomainGroups(systems, nodes, edges, attachToSystem);

  // Scholar / FE-only honesty: when pages exist but no static API/Data/Jobs
  // surface survived quieting, mark the product UI-only (never invent backend).
  markUiOnlyProductHonesty(product, systems, nodes);

  assignFlowOrder(systems, flowPairs);

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
      const capabilityEvidence = projectionEvidence(
        item.file,
        `${item.id} capability on the Extractors roster`,
      );
      let child = nodes.get(childId);
      if (!child) {
        child = {
          id: childId,
          kind: "capability",
          label: item.id,
          technology: item.id,
          parentId: extractorsSystem.id,
          metadata: {
            role: "extractor",
            extractorId: item.id,
            projectedSystem: "extractors",
            collapsedInOverview: true,
            capabilityKind: "extractor",
          },
          evidence: [capabilityEvidence],
        };
        nodes.set(childId, child);
        const contains = edgeFrom(
          "contains",
          extractorsSystem.id,
          childId,
          capabilityEvidence,
        );
        edges.set(contains.id, contains);
        extractorsSystem.evidence.push(capabilityEvidence);
      } else {
        // Upgrade legacy extractor roster services to capability nodes.
        child.kind = "capability";
        child.metadata = {
          ...child.metadata,
          role: "extractor",
          extractorId: item.id,
          projectedSystem: "extractors",
          collapsedInOverview: true,
          capabilityKind: "extractor",
        };
        nodes.set(childId, child);
      }

      // Deterministic detection surface: what this capability understands.
      const surfaces = detectionSurfacesForExtractor(item.id);
      for (const surface of surfaces) {
        const surfaceId = stableId("detection", item.id, surface.id);
        if (nodes.has(surfaceId)) continue;
        const surfaceNode: ArchitectureNode = {
          id: surfaceId,
          kind: "config",
          label: surface.label,
          technology: item.id,
          parentId: childId,
          metadata: {
            role: "detection-surface",
            detectionSurface: true,
            extractorId: item.id,
            surfaceId: surface.id,
            collapsedInOverview: true,
            detail: surface.detail,
          },
          evidence: [
            projectionEvidence(
              item.file,
              `${item.id} detects: ${surface.label} — ${surface.detail}`,
            ),
          ],
        };
        nodes.set(surfaceId, surfaceNode);
        const surfaceEdge = edgeFrom(
          "contains",
          childId,
          surfaceId,
          surfaceNode.evidence[0]!,
        );
        edges.set(surfaceEdge.id, surfaceEdge);
      }
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

  const uiOnly = product.metadata?.uiOnly === true;
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
      ...(uiOnly
        ? [
            {
              severity: "info" as const,
              code: "ui-only-product",
              message:
                "No static API/Data/Jobs evidence — Beginner stays UI-only (no invented backend)",
            },
          ]
        : []),
    ],
  };

  return architectureGraphSchema.parse(projected);
}
