/**
 * FE shells contract (Phase 0 — FE_SHELLS_07082026).
 *
 * Scrape census stays in extractors. These fields mark how a node participates
 * in the product walk (Public → Auth → Protected) vs code/library/noise.
 *
 * Stored on ArchitectureNode.metadata (open record). Certainty for access
 * claims belongs on evidence entries, not on these keys alone.
 */

export const feAccessValues = ["public", "auth", "protected", "unknown"] as const;
export type FeAccess = (typeof feAccessValues)[number];

export const feShellValues = ["public", "auth", "protected"] as const;
export type FeShell = (typeof feShellValues)[number];

export const feSurfaceValues = ["story", "code", "library", "noise"] as const;
export type FeSurface = (typeof feSurfaceValues)[number];

export const feReachabilityValues = [
  "route-tree",
  "orphaned",
  "external-package",
] as const;
export type FeReachability = (typeof feReachabilityValues)[number];

/** App Router group folder names → access (observed path convention). */
const routeGroupAccess: Record<string, FeAccess> = {
  public: "public",
  marketing: "public",
  site: "public",
  auth: "auth",
  login: "auth",
  app: "protected",
  dashboard: "protected",
  admin: "protected",
  "(protected)": "protected",
};

function normalizeGroupName(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed.slice(1, -1).toLowerCase();
  }
  return trimmed.toLowerCase();
}

/**
 * Infer access from App Router route-group segments like `(public)`, `(auth)`, `(app)`.
 * Name-only URL heuristics are intentionally not applied here — never sole proof.
 */
export function accessFromRouteGroups(
  routeGroups: readonly string[],
): { access: FeAccess; shell: FeShell; group: string } | undefined {
  for (const raw of routeGroups) {
    const group = normalizeGroupName(raw);
    const keyed = `(${group})`;
    const access =
      routeGroupAccess[group] ?? routeGroupAccess[keyed] ?? undefined;
    if (!access || access === "unknown") continue;
    if (access === "public" || access === "auth" || access === "protected") {
      return { access, shell: access, group };
    }
  }
  return undefined;
}

/** Extract `(group)` segments from an app/ relative file path. */
export function routeGroupsFromAppFile(relative: string): string[] {
  const file = relative.replaceAll("\\", "/");
  const match = file.match(
    /(?:^|\/)(?:src\/)?app\/(?:(.+)\/)?(?:page|layout|route|loading|error|template|default)\.[cm]?[jt]sx?$/i,
  );
  if (!match) return [];
  const rawSegments = (match[1] ?? "").split("/").filter(Boolean);
  return rawSegments.filter(
    (segment) => segment.startsWith("(") && segment.endsWith(")"),
  );
}

export function isFeAccess(value: unknown): value is FeAccess {
  return (
    typeof value === "string" &&
    (feAccessValues as readonly string[]).includes(value)
  );
}

export function isFeShell(value: unknown): value is FeShell {
  return (
    typeof value === "string" &&
    (feShellValues as readonly string[]).includes(value)
  );
}

export function isFeSurface(value: unknown): value is FeSurface {
  return (
    typeof value === "string" &&
    (feSurfaceValues as readonly string[]).includes(value)
  );
}

/** Stable systemKey for a Pass B shell hub. */
export function shellSystemKey(shell: FeShell): string {
  return `shell:${shell}`;
}

/** Deterministic Beginner / Intermediate label for a shell hub. */
export function shellHubLabel(shell: FeShell): string {
  if (shell === "auth") return "Auth";
  if (shell === "protected") return "Protected";
  return "Public";
}

/**
 * Resolve shell membership from page (or page-molecule) metadata.
 * Only `public` / `auth` / `protected` participate — never invent from names.
 */
export function shellFromAccessMetadata(
  metadata: Record<string, unknown> | undefined,
): FeShell | undefined {
  if (!metadata) return undefined;
  const shell = metadata.shell;
  if (isFeShell(shell)) return shell;
  const access = metadata.access;
  if (access === "public" || access === "auth" || access === "protected") {
    return access;
  }
  return undefined;
}

/** Beginner shell band order: Public → Auth → Protected. */
export function shellFlowRank(shell: FeShell): number {
  if (shell === "public") return 0;
  if (shell === "auth") return 1;
  return 2;
}
