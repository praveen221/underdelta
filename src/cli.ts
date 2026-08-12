#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { analyzeArchitecture, formatAnalysisLines } from "./analysis.js";
import { compileRepository } from "./compile.js";
import {
  assertImpactCompileSource,
  computeChangeImpact,
  formatImpactLines,
  listChangedFiles,
} from "./impact.js";
import {
  architectureGraphSchema,
  impactReportSchema,
  type ImpactReport,
} from "./schema.js";
import { openInBrowser, serveDirectory } from "./serve.js";
import { renderArchitectureHtml } from "./viewer.js";

const program = new Command()
  .name("underdelta")
  .description(
    "Compile a repository into an evidence-backed visual system model.",
  )
  .version("0.1.0");

async function resolveRepository(repository: string): Promise<string> {
  const root = path.resolve(repository);
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch {
    throw new Error(`Repository does not exist: ${root}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${root}`);
  }
  return root;
}

async function runScan(
  repository: string,
  options: {
    output: string;
    open?: boolean;
    serve?: boolean | string;
  },
): Promise<void> {
  const root = await resolveRepository(repository);
  const output = path.resolve(root, options.output);
  const graph = await compileRepository(root);
  const analysis = analyzeArchitecture(graph);
  await mkdir(output, { recursive: true });
  const graphPath = path.join(output, "architecture.json");
  const viewerPath = path.join(output, "index.html");
  await Promise.all([
    writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8"),
    writeFile(viewerPath, renderArchitectureHtml(graph), "utf8"),
  ]);
  process.stdout.write(
    [
      `Compiled ${graph.project.name}`,
      `  ${graph.nodes.length} nodes`,
      `  ${graph.edges.length} relationships`,
      ...formatAnalysisLines(analysis),
      `  Graph: ${graphPath}`,
      `  Browser: ${viewerPath}`,
    ].join("\n") + "\n",
  );

  const wantsServe = options.serve !== undefined && options.serve !== false;
  const wantsOpen = Boolean(options.open) || wantsServe;
  if (!wantsOpen && !wantsServe) return;

  if (wantsServe) {
    const port =
      typeof options.serve === "string" && options.serve.length > 0
        ? Number(options.serve)
        : 4173;
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid --serve port: ${options.serve}`);
    }
    const url = await serveDirectory(output, port);
    process.stdout.write(`Serving ${output}\n  ${url}\n`);
    if (options.open !== false) {
      try {
        await openInBrowser(url);
        process.stdout.write("Opened in your browser.\n");
      } catch {
        process.stdout.write(
          "Could not auto-open a browser — open the URL above manually.\n",
        );
      }
    }
    process.stdout.write("Press Ctrl+C to stop.\n");
    await new Promise(() => {
      /* keep process alive while server runs */
    });
    return;
  }

  try {
    await openInBrowser(viewerPath);
    process.stdout.write("Opened in your browser.\n");
  } catch {
    process.stdout.write(
      `Could not auto-open a browser — open ${viewerPath} manually.\n`,
    );
  }
}

program
  .command("scan", { isDefault: true })
  .description("Extract architecture and generate a self-contained browser")
  .argument("[repository]", "repository to analyze", ".")
  .option("-o, --output <directory>", "output directory", ".underdelta")
  .option("--open", "open the generated browser when the scan finishes")
  .option(
    "--serve [port]",
    "serve .underdelta over HTTP and open it (default port 4173)",
  )
  .action(runScan);

program
  .command("render")
  .description("Render an existing architecture.json as a browser")
  .argument("<graph>", "path to architecture.json")
  .option("-o, --output <file>", "output HTML file", "architecture.html")
  .option("--impact <file>", "optional impact.json to highlight in the viewer")
  .option("--open", "open the generated browser when rendering finishes")
  .action(
    async (
      graphPath: string,
      options: { output: string; open?: boolean; impact?: string },
    ) => {
      const graph = architectureGraphSchema.parse(
        JSON.parse(await readFile(path.resolve(graphPath), "utf8")),
      );
      let impact: ImpactReport | undefined;
      if (options.impact) {
        impact = impactReportSchema.parse(
          JSON.parse(await readFile(path.resolve(options.impact), "utf8")),
        );
      }
      const output = path.resolve(options.output);
      await writeFile(
        output,
        renderArchitectureHtml(graph, impact ? { impact } : {}),
        "utf8",
      );
      process.stdout.write(`Browser: ${output}\n`);
      if (options.open) {
        try {
          await openInBrowser(output);
          process.stdout.write("Opened in your browser.\n");
        } catch {
          process.stdout.write(
            `Could not auto-open a browser — open ${output} manually.\n`,
          );
        }
      }
    },
  );

program
  .command("impact")
  .description(
    "Report product systems reachable from a change (files or git range)",
  )
  .argument("[repository]", "repository to analyze", ".")
  .option("-o, --output <directory>", "output directory", ".underdelta")
  .option(
    "--base <revision>",
    "git base revision (diff uses merge-base range base...head)",
  )
  .option(
    "--head <revision>",
    "git head revision (must match clean HEAD until historical graphs exist)",
  )
  .option(
    "--files <list>",
    "comma-separated repo-relative files (skips git diff)",
  )
  .option("--open", "open the generated browser when impact finishes")
  .option(
    "--serve [port]",
    "serve output over HTTP and open it (default port 4173)",
  )
  .action(
    async (
      repository: string,
      options: {
        output: string;
        base?: string;
        head?: string;
        files?: string;
        open?: boolean;
        serve?: boolean | string;
      },
    ) => {
      const root = await resolveRepository(repository);
      const output = path.resolve(root, options.output);
      const filesOnly = Boolean(options.files);
      // Named --head must match a clean checkout; we always compile the worktree.
      // --files must not be combined with --base/--head (mislabel risk).
      await assertImpactCompileSource(root, {
        ...(options.head ? { headRevision: options.head } : {}),
        ...(options.base ? { baseRevision: options.base } : {}),
        filesOnly,
        ignoreOutput: output,
      });
      const graph = await compileRepository(root);
      const changed = await listChangedFiles(root, {
        ...(options.base && !filesOnly
          ? { baseRevision: options.base }
          : {}),
        ...(options.head && !filesOnly
          ? { headRevision: options.head }
          : {}),
        ...(options.files
          ? {
              files: options.files
                .split(",")
                .map((file) => file.trim())
                .filter(Boolean),
            }
          : {}),
      });
      const impact = computeChangeImpact(graph, changed.files, {
        ...(changed.baseRevision
          ? { baseRevision: changed.baseRevision }
          : {}),
        ...(changed.headRevision
          ? { headRevision: changed.headRevision }
          : {}),
        deletedFiles: changed.deletedFiles,
      });
      const report = impactReportSchema.parse(impact);
      await mkdir(output, { recursive: true });
      const graphPath = path.join(output, "architecture.json");
      const impactPath = path.join(output, "impact.json");
      const viewerPath = path.join(output, "index.html");
      await Promise.all([
        writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8"),
        writeFile(impactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
        writeFile(
          viewerPath,
          renderArchitectureHtml(graph, { impact: report }),
          "utf8",
        ),
      ]);
      process.stdout.write(
        [
          ...formatImpactLines(report),
          `  Graph: ${graphPath}`,
          `  Impact: ${impactPath}`,
          `  Browser: ${viewerPath}`,
        ].join("\n") + "\n",
      );

      const wantsServe = options.serve !== undefined && options.serve !== false;
      const wantsOpen = Boolean(options.open) || wantsServe;
      if (!wantsOpen && !wantsServe) return;

      if (wantsServe) {
        const port =
          typeof options.serve === "string" && options.serve.length > 0
            ? Number(options.serve)
            : 4173;
        if (!Number.isFinite(port) || port <= 0) {
          throw new Error(`Invalid --serve port: ${options.serve}`);
        }
        const url = await serveDirectory(output, port);
        process.stdout.write(`Serving ${output}\n  ${url}\n`);
        if (options.open !== false) {
          try {
            await openInBrowser(url);
            process.stdout.write("Opened in your browser.\n");
          } catch {
            process.stdout.write(
              "Could not auto-open a browser — open the URL above manually.\n",
            );
          }
        }
        process.stdout.write("Press Ctrl+C to stop.\n");
        await new Promise(() => {
          /* keep process alive while server runs */
        });
        return;
      }

      try {
        await openInBrowser(viewerPath);
        process.stdout.write("Opened in your browser.\n");
      } catch {
        process.stdout.write(
          `Could not auto-open a browser — open ${viewerPath} manually.\n`,
        );
      }
    },
  );

try {
  await program.parseAsync();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Underdelta failed: ${message}\n`);
  process.exitCode = 1;
}
