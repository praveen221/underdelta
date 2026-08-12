import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SemanticAdapter } from "../../adapter.js";
import { relativeFile } from "../../graph.js";
import type { Diagnostic, Evidence } from "../../schema.js";

const extensions = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mts", ".cts", ".py", ".json", ".toml", ".txt",
]);

const unsupportedNode = [
  "fastify",
  "@nestjs/common",
  "koa",
  "@koa/router",
  "hono",
  "@hapi/hapi",
  "restify",
  "elysia",
] as const;
const unsupportedPython = [
  "sanic",
  "aiohttp",
  "falcon",
  "tornado",
  "litestar",
] as const;

function manifestPackages(source: string): string[] {
  try {
    const manifest = JSON.parse(source) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const packages = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);
    return unsupportedNode.filter((name) => packages.has(name));
  } catch {
    return [];
  }
}

function detectedFrameworks(file: string, source: string): string[] {
  const base = path.basename(file).toLowerCase();
  if (base === "package.json") return manifestPackages(source);
  if (file.endsWith(".py")) {
    return unsupportedPython.filter((name) =>
      new RegExp(`^\\s*(?:from|import)\\s+${name}\\b`, "mi").test(source)
    );
  }
  if (/requirements[^/]*\.txt$/i.test(file) || base === "pyproject.toml") {
    const lower = source.toLowerCase();
    return unsupportedPython.filter((name) => lower.includes(name));
  }
  return unsupportedNode.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:from\\s+["']${escaped}["']|require\\(\\s*["']${escaped}["'])`,
    ).test(source);
  });
}

export const unsupportedHttpAdapter: SemanticAdapter = {
  id: "http-unsupported",
  version: "0.2.0",
  capability: "http-api",
  extensions,

  async extract(context) {
    const diagnostics: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      for (const framework of detectedFrameworks(file, source)) {
        if (seen.has(framework)) continue;
        seen.add(framework);
        const evidence: Evidence = {
          file,
          extractor: this.id,
          certainty: "observed",
          detail: `Detected HTTP framework ${framework}`,
        };
        diagnostics.push({
          severity: "warning",
          code: "unsupported-http-framework",
          message: `${framework} detected; no HTTP endpoint adapter is installed`,
          evidence,
        });
      }
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
