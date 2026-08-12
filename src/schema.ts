import { z } from "zod";

export const nodeKinds = [
  "product",
  "system",
  "module",
  "ui",
  "page",
  "component",
  "hook",
  "api",
  "route",
  "service",
  /** Product capability (e.g. an Underdelta extractor) — Intermediate roster / drill target. */
  "capability",
  "function",
  "database",
  "schema",
  "table",
  "column",
  "collection",
  "job",
  "cron",
  "queue",
  "topic",
  "pipeline",
  "pipeline-step",
  "external",
  "config",
  "unknown",
] as const;

export const edgeKinds = [
  "contains",
  "imports",
  "calls",
  "renders",
  "reads",
  "writes",
  "queries",
  "exposes",
  "routes-to",
  "schedules",
  "handled-by",
  "triggers",
  "publishes",
  "consumes",
  "flows-to",
  "depends-on",
  "migrates",
  "uses",
  "configures",
] as const;

export const certaintyKinds = ["observed", "derived", "inferred"] as const;

export const sourceRangeSchema = z.object({
  startLine: z.number().int().positive(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().nonnegative(),
});

export const evidenceSchema = z.object({
  file: z.string().min(1),
  range: sourceRangeSchema.optional(),
  extractor: z.string().min(1),
  certainty: z.enum(certaintyKinds),
  detail: z.string().optional(),
});

export const semanticFacetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("symbol"),
    symbolKind: z.enum(["module", "class", "function", "method"]),
    language: z.string().optional(),
  }),
  z.object({
    kind: z.literal("trigger"),
    triggerKind: z.enum(["cron", "interval", "calendar", "event"]),
    provider: z.string().min(1),
    expression: z.string().optional(),
    timezone: z.string().optional(),
    declaration: z.enum(["code", "config", "infrastructure"]),
  }),
  z.object({
    kind: z.literal("job"),
    executionKind: z.enum([
      "in-process",
      "queue",
      "command",
      "http",
      "container",
      "unknown",
    ]),
    provider: z.string().min(1),
    handler: z.string().optional(),
  }),
  z.object({
    kind: z.literal("endpoint"),
    protocol: z.literal("http"),
    method: z.string().min(1),
    path: z.string().min(1),
    provider: z.string().min(1),
    declaration: z.enum(["code", "contract"]),
    operationId: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("resource"),
    resourceKind: z.enum([
      "database",
      "table",
      "collection",
      "queue",
      "topic",
      "secret",
    ]),
    provider: z.string().optional(),
  }),
  z.object({
    kind: z.literal("deploy-unit"),
    deployKind: z.enum([
      "service",
      "workload",
      "serverless",
      "container",
      "scheduled-workload",
      "infrastructure",
      "package",
      "overlay",
    ]),
    provider: z.string().min(1),
    nativeKind: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    namespace: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
    ports: z.array(z.string().min(1)).optional(),
  }),
]);

/**
 * Node metadata is an open record. FE shells contract keys (see `feShells.ts`
 * and `docs/loopplans/FE_SHELLS_07082026.md`) live here when present:
 * - `access`: public | auth | protected | unknown
 * - `shell`: public | auth | protected
 * - `surface`: story | code | library | noise
 * - `reachability`: route-tree | orphaned | external-package
 * - `routeGroups`: App Router `(group)` folder names
 * - `shellHub`: true on Pass B Public/Auth/Protected hubs (`systemKey` shell:*)
 * - `beginnerHero`: true on the `/` page molecule kept beside shell gates
 */
export const architectureNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(nodeKinds),
  label: z.string().min(1),
  qualifiedName: z.string().optional(),
  parentId: z.string().optional(),
  technology: z.string().optional(),
  semantics: z.array(semanticFacetSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(evidenceSchema).min(1),
});

export const architectureEdgeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(edgeKinds),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(evidenceSchema).min(1),
});

export const diagnosticSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  evidence: evidenceSchema.optional(),
});

export const architectureGraphSchema = z
  .object({
    schemaVersion: z.literal("0.2"),
    project: z.object({
      name: z.string().min(1),
      root: z.string().min(1),
      revision: z.string().optional(),
    }),
    generatedAt: z.string().datetime(),
    extractors: z.array(
      z.object({
        id: z.string().min(1),
        version: z.string().min(1),
      }),
    ),
    adapters: z.array(
      z.object({
        id: z.string().min(1),
        version: z.string().min(1),
        capability: z.string().min(1),
      }),
    ),
    nodes: z.array(architectureNodeSchema),
    edges: z.array(architectureEdgeSchema),
    diagnostics: z.array(diagnosticSchema),
  })
  .superRefine((graph, context) => {
    const nodeIds = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate node id: ${node.id}`,
        });
      }
      nodeIds.add(node.id);
    }

    const edgeIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edgeIds.has(edge.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate edge id: ${edge.id}`,
        });
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        context.addIssue({
          code: "custom",
          message: `Edge ${edge.id} references a missing node`,
        });
      }
    }
  });

export type NodeKind = (typeof nodeKinds)[number];
export type EdgeKind = (typeof edgeKinds)[number];
export type Certainty = (typeof certaintyKinds)[number];
export type SourceRange = z.infer<typeof sourceRangeSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type SemanticFacet = z.infer<typeof semanticFacetSchema>;
export type ArchitectureNode = z.infer<typeof architectureNodeSchema>;
export type ArchitectureEdge = z.infer<typeof architectureEdgeSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type ArchitectureGraph = z.infer<typeof architectureGraphSchema>;

/** Deterministic change-impact report (product MVP retention surface). */
export const impactReportSchema = z.object({
  schemaVersion: z.literal("0.1"),
  project: z.object({
    name: z.string().min(1),
    root: z.string().min(1),
    baseRevision: z.string().optional(),
    headRevision: z.string().optional(),
  }),
  changed: z.object({
    files: z.array(z.string().min(1)),
    /** Deleted relative to base; absent from head tree (not analyzed without base graph). */
    deletedFiles: z.array(z.string().min(1)).default([]),
    symbols: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        kind: z.string().min(1),
      }),
    ),
  }),
  impact: z.object({
    endpoints: z.array(
      z.object({
        method: z.string().min(1),
        path: z.string().min(1),
        nodeId: z.string().min(1),
        label: z.string().min(1).optional(),
      }),
    ),
    resources: z.array(
      z.object({
        label: z.string().min(1),
        kind: z.string().min(1),
        nodeId: z.string().min(1),
      }),
    ),
    jobs: z.array(
      z.object({
        label: z.string().min(1),
        nodeId: z.string().min(1),
      }),
    ),
    queues: z.array(
      z.object({
        label: z.string().min(1),
        nodeId: z.string().min(1),
      }),
    ),
    systems: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
      }),
    ),
  }),
  paths: z.array(
    z.object({
      fromSymbolId: z.string().min(1),
      steps: z.array(
        z.object({
          edgeKind: z.string().min(1),
          to: z.string().min(1),
          certainty: z.enum(certaintyKinds),
        }),
      ),
    }),
  ),
  evidenceCount: z.object({
    observed: z.number().int().nonnegative(),
    derived: z.number().int().nonnegative(),
    inferred: z.number().int().nonnegative(),
  }),
  unresolved: z.array(
    z.object({
      fromSymbolId: z.string().optional(),
      callee: z.string().min(1),
      file: z.string().min(1),
      detail: z.string().optional(),
    }),
  ),
  metrics: z.object({
    callsResolved: z.number().int().nonnegative(),
    callsUnresolved: z.number().int().nonnegative(),
    callsAmbiguous: z.number().int().nonnegative(),
  }),
  /** Node ids in the bounded impact neighborhood (for viewer highlight). */
  highlightNodeIds: z.array(z.string().min(1)).default([]),
});

export type ImpactReport = z.infer<typeof impactReportSchema>;
