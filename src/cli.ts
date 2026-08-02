#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { compileRepository } from "./compile.js";
import { architectureGraphSchema } from "./schema.js";
import { renderArchitectureHtml } from "./viewer.js";

const program = new Command()
  .name("underdelta")
  .description(
    "Compile a repository into an evidence-backed visual system model.",
  )
  .version("0.1.0");

program
  .command("scan")
  .description("Extract architecture and generate a self-contained browser")
  .argument("[repository]", "repository to analyze", ".")
  .option("-o, --output <directory>", "output directory", ".underdelta")
  .action(
    async (
      repository: string,
      options: {
        output: string;
      },
    ) => {
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
    },
  );

program
  .command("render")
  .description("Render an existing architecture.json as a browser")
  .argument("<graph>", "path to architecture.json")
  .option("-o, --output <file>", "output HTML file", "architecture.html")
  .action(async (graphPath: string, options: { output: string }) => {
    const graph = architectureGraphSchema.parse(
      JSON.parse(await readFile(path.resolve(graphPath), "utf8")),
    );
    const output = path.resolve(options.output);
    await writeFile(output, renderArchitectureHtml(graph), "utf8");
    process.stdout.write(`Browser: ${output}\n`);
  });

await program.parseAsync();
