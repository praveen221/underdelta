import { stableId } from "../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
  SemanticFacet,
} from "../schema.js";

type TriggerFacet = Extract<SemanticFacet, { kind: "trigger" }>;
type JobFacet = Extract<SemanticFacet, { kind: "job" }>;

export function triggerFacet(node: ArchitectureNode): TriggerFacet | undefined {
  return node.semantics?.find(
    (facet): facet is TriggerFacet => facet.kind === "trigger",
  );
}

export function jobFacet(node: ArchitectureNode): JobFacet | undefined {
  return node.semantics?.find(
    (facet): facet is JobFacet => facet.kind === "job",
  );
}

export function humanizeCronExpression(expression: string): string {
  const expr = expression.trim();
  if (!expr) return expr;
  if (/^@hourly$/i.test(expr)) return "every hour";
  if (/^@daily$/i.test(expr)) return "every day";
  if (/^@weekly$/i.test(expr)) return "every week";
  if (/^@monthly$/i.test(expr)) return "every month";
  if (/^@yearly$/i.test(expr) || /^@annually$/i.test(expr)) return "every year";

  const parts = expr.split(/\s+/);
  if (parts.length === 6) {
    const second = parts.shift()!;
    const everySecond = /^\*\/(\d+)$/.exec(second);
    if (everySecond && parts.every((part) => part === "*")) {
      const n = Number(everySecond[1]);
      return n === 1 ? "every second" : `every ${n} seconds`;
    }
    if (second !== "0") return expr;
  }
  if (parts.length !== 5) return expr;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const starRest = dayOfMonth === "*" && month === "*" && dayOfWeek === "*";

  if (minute === "*" && hour === "*" && starRest) return "every minute";
  const everyMinute = /^\*\/(\d+)$/.exec(minute ?? "");
  if (everyMinute && hour === "*" && starRest) {
    const n = Number(everyMinute[1]);
    return n === 1 ? "every minute" : `every ${n} minutes`;
  }
  if (minute === "0" && hour === "*" && starRest) return "every hour";
  const everyHour = /^\*\/(\d+)$/.exec(hour ?? "");
  if (minute === "0" && everyHour && starRest) {
    const n = Number(everyHour[1]);
    return n === 1 ? "every hour" : `every ${n} hours`;
  }
  if (
    /^\d+$/.test(minute ?? "") &&
    /^\d+$/.test(hour ?? "") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `every day at ${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
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
    /^\d+$/.test(minute ?? "") &&
    /^\d+$/.test(hour ?? "") &&
    dayOfMonth === "*" &&
    month === "*" &&
    /^\d+$/.test(dayOfWeek ?? "")
  ) {
    const day = weekdays[Number(dayOfWeek) % 7] ?? `day ${dayOfWeek}`;
    return `every ${day} at ${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
  }
  return expr;
}

export function createScheduledWorkSystem(evidence: Evidence): ArchitectureNode {
  return {
    id: stableId("system", "jobs"),
    kind: "system",
    label: "Scheduled jobs",
    technology: "semantic",
    metadata: { projection: "semantic", systemKey: "jobs" },
    evidence: [evidence],
  };
}

export function scheduledWorkSourcesForHandler(
  handlerId: string,
  edges: Iterable<ArchitectureEdge>,
): string[] {
  const all = [...edges];
  const jobs = new Set(
    all
      .filter((edge) => edge.kind === "handled-by" && edge.target === handlerId)
      .map((edge) => edge.source),
  );
  const triggers = all
    .filter((edge) => edge.kind === "schedules" && jobs.has(edge.target))
    .map((edge) => edge.source);
  return triggers.length ? triggers : [...jobs];
}

export function projectScheduledWork(args: {
  nodes: Map<string, ArchitectureNode>;
  edges: Map<string, ArchitectureEdge>;
  jobsSystem: ArchitectureNode;
  attach(nodeId: string, systemId: string, evidence: Evidence): void;
  humanizeIdentifier(label: string): string;
}): void {
  const scheduledJobs = new Map<string, ArchitectureNode>();
  for (const node of args.nodes.values()) {
    if (jobFacet(node)) scheduledJobs.set(node.id, node);
  }

  for (const node of args.nodes.values()) {
    const trigger = triggerFacet(node);
    const job = jobFacet(node);
    if (!trigger && !job) continue;
    args.attach(node.id, args.jobsSystem.id, node.evidence[0]!);

    if (job) {
      node.label = args.humanizeIdentifier(job.handler ?? node.label);
      args.nodes.set(node.id, node);
      continue;
    }

    const targetJob = [...args.edges.values()]
      .filter((edge) => edge.kind === "schedules" && edge.source === node.id)
      .map((edge) => scheduledJobs.get(edge.target))
      .find(Boolean);
    const targetFacet = targetJob ? jobFacet(targetJob) : undefined;
    const subject = targetFacet?.handler ?? targetJob?.label ?? node.label;
    const expression = trigger?.expression;
    const when = expression
      ? trigger.triggerKind === "cron"
        ? humanizeCronExpression(expression)
        : expression
      : trigger?.triggerKind;
    node.label = when
      ? `${args.humanizeIdentifier(subject)} (${when})`
      : args.humanizeIdentifier(subject);
    args.nodes.set(node.id, node);
  }
}
