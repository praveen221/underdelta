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
import { mongoExtractor } from "./extractors/mongo.js";
import { openapiExtractor } from "./extractors/openapi.js";
import { prismaExtractor } from "./extractors/prisma.js";
import { pythonExtractor } from "./extractors/python.js";
import { sqlExtractor } from "./extractors/sql.js";
import { typescriptExtractor } from "./extractors/typescript.js";
import {
  parseReadmeHeadingHints,
  parseReadmeTitle,
  preferProductLabel,
  projectSemanticArchitecture,
  type PackageManifestHint,
  type ReadmeHeadingHint,
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
    // Fall through to Python packaging.
  }
  return readPyprojectManifest(root);
}

/** Minimal Poetry/PEP 621 name extraction for Python real-repo product labels. */
async function readPyprojectManifest(
  root: string,
): Promise<PackageManifestHint | undefined> {
  try {
    const text = await readFile(path.join(root, "pyproject.toml"), "utf8");
    for (const section of [/^\[project\]/m, /^\[tool\.poetry\]/m]) {
      const idx = text.search(section);
      if (idx < 0) continue;
      const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(
        text.slice(idx, idx + 800),
      )?.[1];
      if (name) return { name };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function readReadmeProjection(
  root: string,
): Promise<{ hints?: ReadmeHeadingHint[]; title?: string }> {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    try {
      const markdown = await readFile(path.join(root, name), "utf8");
      const hints = parseReadmeHeadingHints(markdown);
      const title = parseReadmeTitle(markdown);
      return {
        ...(hints.length ? { hints } : {}),
        ...(title ? { title } : {}),
      };
    } catch {
      // try next conventional README name
    }
  }
  return {};
}

async function projectName(
  root: string,
  manifest?: PackageManifestHint,
  readmeTitle?: string,
): Promise<string> {
  return preferProductLabel(
    manifest?.name,
    readmeTitle,
    path.basename(root),
  );
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
    pythonExtractor,
    mongoExtractor,
    openapiExtractor,
    prismaExtractor,
    sqlExtractor,
  ];
  const contributions = await Promise.all(
    extractors.map((extractor) => runExtractor(extractor, root, files)),
  );

  const packageManifest = await readPackageManifest(root);
  const readme = await readReadmeProjection(root);
  const productId = stableId("product", root);
  const productLabel = await projectName(
    root,
    packageManifest,
    readme.title,
  );
  const productNode: ArchitectureNode = {
    id: productId,
    kind: "product",
    label: productLabel,
    metadata: {
      fileCount: files.length,
      ...(packageManifest?.name && packageManifest.name !== productLabel
        ? { packageName: packageManifest.name }
        : {}),
      ...(readme.title && readme.title === productLabel
        ? { labelSource: "readme", readmeTitle: readme.title }
        : {}),
    },
    evidence: [
      {
        file: ".",
        extractor: "repository",
        certainty: "observed",
      },
      ...(readme.title && readme.title === productLabel
        ? [
            {
              file: "README.md",
              extractor: "repository" as const,
              certainty: "derived" as const,
              detail: `Product label from README title "${readme.title}"`,
            },
          ]
        : []),
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
  return projectSemanticArchitecture(builder.build(project), {
    ...(packageManifest ? { packageManifest } : {}),
    ...(readme.hints ? { readmeHints: readme.hints } : {}),
    ...(readme.title ? { readmeTitle: readme.title } : {}),
  });
}
