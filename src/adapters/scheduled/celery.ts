import { readFile } from "node:fs/promises";
import type { SemanticAdapter } from "../../adapter.js";
import { relativeFile } from "../../graph.js";
import type { ArchitectureEdge, ArchitectureNode } from "../../schema.js";
import {
  addJobBinding,
  addScheduledWork,
  evidenceAt,
  functionIdFor,
} from "./common.js";

const extensions = new Set([".py"]);

function unquote(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
}

function crontabExpression(args: string): string {
  const fields: Record<string, string> = {
    minute: "*",
    hour: "*",
    day_of_month: "*",
    month_of_year: "*",
    day_of_week: "*",
  };
  for (const match of args.matchAll(
    /\b(minute|hour|day_of_month|month_of_year|day_of_week)\s*=\s*([^,)]+)/g,
  )) {
    if (match[1] && match[2]) fields[match[1]] = unquote(match[2]);
  }
  const positional = args
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !part.includes("="));
  const order = [
    "minute",
    "hour",
    "day_of_month",
    "month_of_year",
    "day_of_week",
  ];
  positional.forEach((value, index) => {
    const key = order[index];
    if (key) fields[key] = unquote(value);
  });
  return [
    fields.minute,
    fields.hour,
    fields.day_of_month,
    fields.month_of_year,
    fields.day_of_week,
  ].join(" ");
}

function parseSchedule(value: string): {
  kind: "cron" | "interval";
  expression: string;
} {
  const trimmed = value.trim();
  const cron = /^crontab\s*\(([\s\S]*)\)$/.exec(trimmed);
  if (cron) return { kind: "cron", expression: crontabExpression(cron[1] ?? "") };
  const delta = /^timedelta\s*\(([\s\S]*)\)$/.exec(trimmed);
  if (delta) return { kind: "interval", expression: `timedelta(${delta[1] ?? ""})` };
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { kind: "interval", expression: `${trimmed} seconds` };
  }
  return { kind: "interval", expression: trimmed };
}

function basename(task: string): string {
  return task.split(".").filter(Boolean).at(-1) ?? task;
}

function taskIdentity(file: string, handler: string): string {
  const module = file
    .replace(/\.py$/i, "")
    .replace(/\/__init__$/i, "")
    .replaceAll("/", ".");
  return `${module}.${handler}`;
}

function taskHandlerId(
  nodes: readonly ArchitectureNode[],
  task: string,
): string | undefined {
  const handler = basename(task);
  if (!task.includes(".")) {
    const matches = nodes.filter(
      (node) => node.kind === "function" && node.label === handler,
    );
    return matches.length === 1 ? matches[0]?.id : undefined;
  }
  const module = task.slice(0, -(handler.length + 1)).replaceAll(".", "/");
  const candidates = new Set([
    `${module}.py#${handler}`,
    `${module}/__init__.py#${handler}`,
  ]);
  const matches = nodes.filter(
    (node) => node.kind === "function" &&
      typeof node.qualifiedName === "string" &&
      candidates.has(node.qualifiedName),
  );
  return matches.length === 1 ? matches[0]?.id : undefined;
}

function balancedObject(source: string, open: number): string | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return undefined;
}

function mappingValue(source: string, key: string): string | undefined {
  const keyMatch = new RegExp(`["']?${key}["']?\\s*:\\s*`).exec(source);
  if (!keyMatch || keyMatch.index === undefined) return undefined;
  const start = keyMatch.index + keyMatch[0].length;
  let depth = 0;
  let quote: string | undefined;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    } else if ((char === "," || char === "\n") && depth === 0) {
      return source.slice(start, index).trim();
    }
  }
  const value = source.slice(start).trim();
  return value || undefined;
}

export const celeryScheduledWorkAdapter: SemanticAdapter = {
  id: "scheduled-celery",
  version: "0.2.0",
  capability: "scheduled-work",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      const taskPattern =
        /@(?:shared_task|task|(?:[A-Za-z_][\w]*)\.task)\b(?:\s*\([^)]*\))?\s*(?:\n\s*@[^\n]+)*\s*(?:\n\s*)?(?:async\s+)?def\s+([A-Za-z_][\w]*)/g;
      for (const match of source.matchAll(taskPattern)) {
        const handler = match[1];
        if (!handler || match.index === undefined) continue;
        const item = evidenceAt(
          this.id,
          file,
          source,
          match.index,
          `Celery task ${handler}`,
        );
        const handlerId = functionIdFor(context.nodes, file, handler);
        addJobBinding(nodes, edges, {
          baseNodes: context.nodes,
          file,
          provider: "celery",
          name: handler,
          executionKind: "queue",
          evidence: item,
          handler,
          identity: taskIdentity(file, handler),
          ...(handlerId ? { handlerId } : {}),
        });
      }

      for (const assign of source.matchAll(
        /\b(?:[A-Za-z_][\w]*\.)?(?:conf\.)?(?:beat_schedule|celery_?beat_schedule)\s*=\s*\{/gi,
      )) {
        if (assign.index === undefined) continue;
        const open = source.indexOf("{", assign.index);
        const body = open >= 0 ? balancedObject(source, open) : undefined;
        if (!body) continue;
        for (const entry of body.matchAll(
          /(["'][^"']+["'])\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
        )) {
          const entryName = unquote(entry[1] ?? "");
          const entryBody = entry[2] ?? "";
          const task = mappingValue(entryBody, "task");
          const schedule = mappingValue(entryBody, "schedule");
          if (!task || !schedule) continue;
          const taskPath = unquote(task);
          const handler = basename(taskPath);
          const handlerId = taskHandlerId(context.nodes, taskPath);
          const parsed = parseSchedule(schedule);
          addScheduledWork(nodes, edges, {
            baseNodes: context.nodes,
            file,
            provider: "celery",
            name: entryName || handler,
            expression: parsed.expression,
            triggerKind: parsed.kind,
            declaration: "config",
            executionKind: "queue",
            handler,
            identity: taskPath,
            ...(handlerId ? { handlerId } : {}),
            evidence: evidenceAt(
              this.id,
              file,
              source,
              assign.index,
              `Celery beat schedule ${entryName || handler}`,
            ),
          });
        }
      }

      for (const match of source.matchAll(
        /\.add_periodic_task\s*\(\s*([^,]+)\s*,\s*([A-Za-z_][\w]*)(?:\.s\s*\([^)]*\))?\s*(?:,\s*name\s*=\s*(["'][^"']+["']))?/g,
      )) {
        const handler = match[2];
        if (!handler || match.index === undefined) continue;
        const parsed = parseSchedule(match[1] ?? "");
        const handlerId = functionIdFor(context.nodes, file, handler);
        addScheduledWork(nodes, edges, {
          baseNodes: context.nodes,
          file,
          provider: "celery",
          name: match[3] ? unquote(match[3]) : handler,
          expression: parsed.expression,
          triggerKind: parsed.kind,
          declaration: "code",
          executionKind: "queue",
          handler,
          identity: taskIdentity(file, handler),
          ...(handlerId ? { handlerId } : {}),
          evidence: evidenceAt(
            this.id,
            file,
            source,
            match.index,
            `Celery periodic task ${handler}`,
          ),
        });
      }
    }

    return {
      adapter: {
        id: this.id,
        version: this.version,
        capability: this.capability,
      },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
