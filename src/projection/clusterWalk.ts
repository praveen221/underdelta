import type { ArchitectureNode } from "../schema.js";

/**
 * Route-group / kind-cluster hubs are navigation frames. Entering one
 * (double-click or Find) should put API → Articles on the Back stack so
 * Esc cannot skip from Comments to Beginner.
 */
export function isClusterWalkHub(
  node: ArchitectureNode | undefined,
): boolean {
  return !!(
    node?.metadata?.routeGroup === true ||
    node?.metadata?.kindCluster === true
  );
}

/** Product-flow API + cluster hubs that belong on the crumb/Back path. */
export function isClusterWalkFrame(
  node: ArchitectureNode | undefined,
): boolean {
  if (!node || node.kind === "product") return false;
  if (node.kind === "api" || node.metadata?.systemKey === "api") return true;
  return isClusterWalkHub(node);
}

/**
 * Ancestors of a cluster hub, root-first: Comments → [HTTP API, Articles].
 * HTTP API itself has no cluster ancestors (parent is product).
 */
export function clusterWalkAncestors(
  focusId: string,
  byId: Map<string, ArchitectureNode>,
): string[] {
  const frames: string[] = [];
  const seen = new Set<string>([focusId]);
  let current = byId.get(focusId);
  while (current) {
    const parentId = current.parentId;
    if (!parentId || seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent || parent.kind === "product") break;
    if (isClusterWalkFrame(parent)) frames.unshift(parent.id);
    current = parent;
  }
  return frames;
}
