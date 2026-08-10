import { edgeFrom, stableId } from "../../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
  SemanticFacet,
} from "../../schema.js";

export function evidenceAt(
  extractor: string,
  file: string,
  source: string,
  offset: number,
  detail: string,
): Evidence {
  const line = source.slice(0, offset).split(/\r?\n/).length;
  return {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor,
    certainty: "observed",
    detail,
  };
}

export function moduleIdFor(
  nodes: readonly ArchitectureNode[],
  file: string,
): string {
  return (
    nodes.find(
      (node) =>
        node.kind === "module" &&
        (node.qualifiedName === file || node.label === file),
    )?.id ?? stableId("module", file)
  );
}

export function functionIdFor(
  nodes: readonly ArchitectureNode[],
  file: string,
  handler: string,
): string | undefined {
  const exact = nodes.filter(
    (node) =>
      (node.kind === "function" || node.kind === "hook") &&
      node.label === handler &&
      (node.qualifiedName === `${file}#${handler}` ||
        node.evidence.some((item) => item.file === file)),
  );
  return exact.length === 1 ? exact[0]?.id : undefined;
}

export function addScheduledWork(
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  args: {
    baseNodes: readonly ArchitectureNode[];
    file: string;
    provider: string;
    name: string;
    expression?: string;
    timezone?: string;
    triggerKind: "cron" | "interval" | "calendar" | "event";
    declaration: "code" | "config" | "infrastructure";
    executionKind:
      | "in-process"
      | "queue"
      | "command"
      | "http"
      | "container"
      | "unknown";
    evidence: Evidence;
    handler?: string;
    handlerId?: string;
    identity?: string;
    parentId?: string;
  },
): { triggerId: string; jobId: string } {
  const moduleId = args.parentId ?? moduleIdFor(args.baseNodes, args.file);
  const triggerId = stableId(
    "trigger",
    args.provider,
    args.file,
    args.name,
    args.expression ?? args.triggerKind,
  );
  const jobIdentity =
    args.handlerId ??
    args.identity ??
    `${args.file}#${args.handler ?? args.name}:${args.expression ?? args.triggerKind}`;
  const jobId = stableId("job", args.provider, jobIdentity);
  const triggerFacet: SemanticFacet = {
    kind: "trigger",
    triggerKind: args.triggerKind,
    provider: args.provider,
    declaration: args.declaration,
    ...(args.expression ? { expression: args.expression } : {}),
    ...(args.timezone ? { timezone: args.timezone } : {}),
  };

  nodes.push({
    id: triggerId,
    kind: "cron",
    label: args.name,
    parentId: moduleId,
    technology: args.provider,
    semantics: [triggerFacet],
    metadata: {},
    evidence: [args.evidence],
  });
  edges.push(edgeFrom("contains", moduleId, triggerId, args.evidence));
  addJobBinding(nodes, edges, {
    baseNodes: args.baseNodes,
    file: args.file,
    provider: args.provider,
    name: args.handler ?? args.name,
    executionKind: args.executionKind,
    evidence: args.evidence,
    ...(args.handler ? { handler: args.handler } : {}),
    ...(args.handlerId ? { handlerId: args.handlerId } : {}),
    identity: jobIdentity,
    parentId: moduleId,
  });
  edges.push(edgeFrom("schedules", triggerId, jobId, args.evidence));
  return { triggerId, jobId };
}

export function addJobBinding(
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  args: {
    baseNodes: readonly ArchitectureNode[];
    file: string;
    provider: string;
    name: string;
    executionKind:
      | "in-process"
      | "queue"
      | "command"
      | "http"
      | "container"
      | "unknown";
    evidence: Evidence;
    handler?: string;
    handlerId?: string;
    identity?: string;
    parentId?: string;
  },
): string {
  const moduleId = args.parentId ?? moduleIdFor(args.baseNodes, args.file);
  const jobId = stableId(
    "job",
    args.provider,
    args.handlerId ?? args.identity ?? `${args.file}#${args.handler ?? args.name}`,
  );
  const jobFacet: SemanticFacet = {
    kind: "job",
    executionKind: args.executionKind,
    provider: args.provider,
    ...(args.handler ? { handler: args.handler } : {}),
  };
  nodes.push({
    id: jobId,
    kind: "job",
    label: args.name,
    parentId: moduleId,
    technology: args.provider,
    semantics: [jobFacet],
    metadata: {},
    evidence: [args.evidence],
  });
  edges.push(edgeFrom("contains", moduleId, jobId, args.evidence));
  if (args.handlerId) {
    edges.push(edgeFrom("handled-by", jobId, args.handlerId, args.evidence));
  }
  return jobId;
}
