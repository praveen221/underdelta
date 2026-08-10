import type {
  ArchitectureGraph,
  ArchitectureNode,
  Certainty,
  Diagnostic,
} from "./schema.js";

export interface DetectedCapability {
  id: string;
  label: string;
  count: number;
}

export interface ArchitectureAnalysis {
  status: "mapped" | "partial" | "empty";
  message: string;
  filesScanned: number;
  capabilities: DetectedCapability[];
  certainty: Record<Certainty, number>;
  unsupported: Diagnostic[];
  issues: Diagnostic[];
}

interface CapabilityDefinition {
  id: string;
  label: string;
  matches(node: ArchitectureNode): boolean;
}

function hasFacet(node: ArchitectureNode, kind: string): boolean {
  return node.semantics?.some((facet) => facet.kind === kind) === true;
}

const capabilityDefinitions: CapabilityDefinition[] = [
  {
    id: "frontend",
    label: "Frontend",
    matches: (node) =>
      node.kind === "page" ||
      node.kind === "component" ||
      node.kind === "hook" ||
      node.metadata?.routeMolecule === true,
  },
  {
    id: "http",
    label: "HTTP API",
    matches: (node) => hasFacet(node, "endpoint"),
  },
  {
    id: "data",
    label: "Data access",
    matches: (node) => hasFacet(node, "resource"),
  },
  {
    id: "scheduled",
    label: "Scheduled work",
    matches: (node) => hasFacet(node, "trigger"),
  },
  {
    id: "deployment",
    label: "Deployment",
    matches: (node) => hasFacet(node, "deploy-unit"),
  },
  {
    id: "messaging",
    label: "Messaging",
    matches: (node) => node.kind === "queue" || node.kind === "topic",
  },
  {
    id: "pipelines",
    label: "Pipelines",
    matches: (node) =>
      node.kind === "pipeline" && node.metadata?.projection !== "semantic",
  },
];

function productFileCount(graph: ArchitectureGraph): number {
  const product = graph.nodes.find((node) => node.kind === "product");
  const count = product?.metadata?.fileCount;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return count === 1 ? singular : pluralValue;
}

export function analyzeArchitecture(
  graph: ArchitectureGraph,
): ArchitectureAnalysis {
  const capabilities = capabilityDefinitions
    .map((definition) => ({
      id: definition.id,
      label: definition.label,
      count: graph.nodes.filter(definition.matches).length,
    }))
    .filter((capability) => capability.count > 0);

  const certainty: Record<Certainty, number> = {
    observed: 0,
    derived: 0,
    inferred: 0,
  };
  for (const item of [...graph.nodes, ...graph.edges]) {
    for (const evidence of item.evidence) certainty[evidence.certainty] += 1;
  }

  const unsupported = graph.diagnostics.filter((diagnostic) =>
    diagnostic.code.startsWith("unsupported-"),
  );
  const issues = graph.diagnostics.filter(
    (diagnostic) => diagnostic.severity !== "info",
  );
  const filesScanned = productFileCount(graph);

  let status: ArchitectureAnalysis["status"] = "mapped";
  let message = `Mapped ${capabilities.length} supported ${plural(capabilities.length, "capability", "capabilities")} from ${filesScanned} scanned ${plural(filesScanned, "file")}.`;
  if (issues.length > 0) {
    status = "partial";
    message = `Partial map: ${capabilities.length} supported ${plural(capabilities.length, "capability", "capabilities")} and ${issues.length} ${plural(issues.length, "issue")} from ${filesScanned} scanned ${plural(filesScanned, "file")}.`;
  } else if (capabilities.length === 0) {
    status = "empty";
    message = `No supported product/runtime evidence found in ${filesScanned} scanned ${plural(filesScanned, "file")}.`;
  }

  return {
    status,
    message,
    filesScanned,
    capabilities,
    certainty,
    unsupported,
    issues,
  };
}

export function formatAnalysisLines(analysis: ArchitectureAnalysis): string[] {
  const lines = [`  Analysis: ${analysis.message}`];
  if (analysis.capabilities.length > 0) {
    lines.push(
      `  Detected: ${analysis.capabilities
        .map((capability) => `${capability.label} (${capability.count})`)
        .join(", ")}`,
    );
  }
  for (const issue of analysis.issues) {
    lines.push(`  ${issue.severity === "error" ? "Error" : "Warning"}: ${issue.message}`);
  }
  return lines;
}
