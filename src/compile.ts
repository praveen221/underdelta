import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  discoverFiles,
  runExtractor,
  type ArchitectureExtractor,
} from "./extractor.js";
import { GraphBuilder, edgeFrom, stableId } from "./graph.js";
import { prismaExtractor } from "./extractors/prisma.js";
import { sqlExtractor } from "./extractors/sql.js";
import { typescriptExtractor } from "./extractors/typescript.js";
import {
  projectSemanticArchitecture,
  type PackageManifestHint,
} from "./project.js";
import type { ArchitectureGraph, ArchitectureNode } from "./schema.js";

const execFileAsync = promisify(execFile);

export interface CompileOptions {
  extractors?: ArchitectureExtractor[];
}

async function readPackageManifest(
  root: string,
): Promise<PackageManifestHint | undefined> {
  try {
    return JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ) as PackageManifestHint;
  } catch {
    return undefined;
  }
}

async function projectName(
  root: string,
  manifest?: PackageManifestHint,
): Promise<string> {
  if (manifest?.name) return manifest.name;
  return path.basename(root);
}

async function revision(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--verify", "HEAD"],
      { cwd: root },
    );
    return stdout.trim();
  } catch {
    return undefined;
  }
}

export async function compileRepository(
  input: string,
  options: CompileOptions = {},
): Promise<ArchitectureGraph> {
  const root = path.resolve(input);
  const files = await discoverFiles(root);
  const extractors = options.extractors ?? [
    typescriptExtractor,
    prismaExtractor,
    sqlExtractor,
  ];
  const contributions = await Promise.all(
    extractors.map((extractor) => runExtractor(extractor, root, files)),
  );

  const packageManifest = await readPackageManifest(root);
  const productId = stableId("product", root);
  const productNode: ArchitectureNode = {
    id: productId,
    kind: "product",
    label: await projectName(root, packageManifest),
    metadata: {
      fileCount: files.length,
    },
    evidence: [
      {
        file: ".",
        extractor: "repository",
        certainty: "observed",
      },
    ],
  };

  const topLevelNodes = contributions
    .flatMap((contribution) => contribution.nodes)
    .filter((node) => node.parentId === undefined);
  const builder = new GraphBuilder();
  builder.add({
    extractor: { id: "repository", version: "0.1.0" },
    nodes: [productNode],
    edges: topLevelNodes.map((node) =>
      edgeFrom("contains", productId, node.id, node.evidence[0] ?? productNode.evidence[0]!),
    ),
    diagnostics: [],
  });
  for (const contribution of contributions) builder.add(contribution);

  const gitRevision = await revision(root);
  const project: ArchitectureGraph["project"] = {
    name: productNode.label,
    root,
  };
  if (gitRevision !== undefined) project.revision = gitRevision;
  return projectSemanticArchitecture(
    builder.build(project),
    packageManifest ? { packageManifest } : {},
  );
}
