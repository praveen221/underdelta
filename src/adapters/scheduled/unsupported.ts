import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SemanticAdapter } from "../../adapter.js";
import { relativeFile } from "../../graph.js";
import type { Diagnostic, Evidence } from "../../schema.js";

const extensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".json",
  ".toml",
  ".txt",
]);
const unsupported = [
  "agenda",
  "bree",
  "node-schedule",
  "apscheduler",
  "django-q",
  "django_q",
  "rq-scheduler",
  "rq_scheduler",
] as const;

function detectedFramework(file: string, source: string): string | undefined {
  const base = path.basename(file).toLowerCase();
  if (base === "package.json") {
    try {
      const manifest = JSON.parse(source) as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      const packages = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
      ]);
      return unsupported.find((name) => packages.has(name));
    } catch {
      return undefined;
    }
  }
  if (file.endsWith(".py")) {
    return unsupported.find((name) => {
      const moduleName = name.replaceAll("-", "_");
      return new RegExp(`^\\s*(?:from|import)\\s+${moduleName}\\b`, "m").test(
        source,
      );
    });
  }
  if (/requirements[^/]*\.txt$/i.test(file) || base === "pyproject.toml") {
    const lower = source.toLowerCase();
    return unsupported.find((name) => lower.includes(name.toLowerCase()));
  }
  return unsupported.find((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:from\\s+["']${escaped}["']|require\\(\\s*["']${escaped}["'])`,
    ).test(source);
  });
}

export const unsupportedScheduledWorkAdapter: SemanticAdapter = {
  id: "scheduled-unsupported",
  version: "0.2.0",
  capability: "scheduled-work",
  extensions,

  async extract(context) {
    const diagnostics: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      const framework = detectedFramework(file, source);
      if (!framework || seen.has(framework)) continue;
      seen.add(framework);
      const evidence: Evidence = {
        file,
        extractor: this.id,
        certainty: "observed",
        detail: `Detected scheduled-work package ${framework}`,
      };
      diagnostics.push({
        severity: "warning",
        code: "unsupported-scheduled-framework",
        message: `${framework} detected; no scheduled-work adapter is installed`,
        evidence,
      });
    }
    return {
      adapter: {
        id: this.id,
        version: this.version,
        capability: this.capability,
      },
      nodes: [],
      edges: [],
      diagnostics,
    };
  },
};
