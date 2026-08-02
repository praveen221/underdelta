#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { compileRepository } from "./compile.js";
import { architectureGraphSchema } from "./schema.js";
import { openInBrowser, serveDirectory } from "./serve.js";
import { renderArchitectureHtml } from "./viewer.js";

const program = new Command()
  .name("underdelta")
  .description(
    "Compile a repository into an evidence-backed visual system model.",
  )
  .version("0.1.0");

async function runScan(
  repository: string,
  options: {
    output: string;
    open?: boolean;
    serve?: boolean | string;
  },
): Promise<void> {
  const root = path.resolve(repository);
  const output = path.resolve(root, options.output);
  const graph = await compileRepository(root);
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
  .option("--open", "open the generated browser when rendering finishes")
  .action(async (graphPath: string, options: { output: string; open?: boolean }) => {
    const graph = architectureGraphSchema.parse(
      JSON.parse(await readFile(path.resolve(graphPath), "utf8")),
    );
    const output = path.resolve(options.output);
    await writeFile(output, renderArchitectureHtml(graph), "utf8");
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
  });

await program.parseAsync();
