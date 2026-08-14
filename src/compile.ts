import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  discoverFiles,
  runExtractor,
  type ArchitectureExtractor,
} from "./extractor.js";
import {
  runSemanticAdapter,
  type SemanticAdapter,
} from "./adapter.js";
import { dataResourceAdapter } from "./adapters/data/resources.js";
import { deployUnitAdapter } from "./adapters/deploy/units.js";
import { httpEndpointAdapter } from "./adapters/http/endpoints.js";
import { flaskHttpAdapter } from "./adapters/http/flask.js";
import { unsupportedHttpAdapter } from "./adapters/http/unsupported.js";
import { celeryScheduledWorkAdapter } from "./adapters/scheduled/celery.js";
import { kubernetesScheduledWorkAdapter } from "./adapters/scheduled/kubernetes.js";
import { nodeScheduledWorkAdapter } from "./adapters/scheduled/node.js";
import { unsupportedScheduledWorkAdapter } from "./adapters/scheduled/unsupported.js";
import { GraphBuilder, edgeFrom, stableId } from "./graph.js";
import { dockerExtractor } from "./extractors/docker.js";
import { graphqlExtractor } from "./extractors/graphql.js";
import { helmExtractor } from "./extractors/helm.js";
import { kubernetesExtractor } from "./extractors/kubernetes.js";
import { kustomizeExtractor } from "./extractors/kustomize.js";
import { mongoExtractor } from "./extractors/mongo.js";
import { openapiExtractor } from "./extractors/openapi.js";
import { prismaExtractor } from "./extractors/prisma.js";
import { pythonExtractor } from "./extractors/python.js";
import { sqlExtractor } from "./extractors/sql.js";
import { terraformExtractor } from "./extractors/terraform.js";
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

export const COMPILER_TOOL_VERSION = "0.1.0";

export interface CompileOptions {
  extractors?: ArchitectureExtractor[];
  adapters?: SemanticAdapter[];
}

export function defaultExtractors(): ArchitectureExtractor[] {
  return [
    typescriptExtractor,
    pythonExtractor,
    mongoExtractor,
    openapiExtractor,
    graphqlExtractor,
    dockerExtractor,
    terraformExtractor,
    kubernetesExtractor,
    kustomizeExtractor,
    helmExtractor,
    prismaExtractor,
    sqlExtractor,
  ];
}

export function defaultAdapters(): SemanticAdapter[] {
  return [
    dataResourceAdapter,
    deployUnitAdapter,
    httpEndpointAdapter,
    flaskHttpAdapter,
    unsupportedHttpAdapter,
    nodeScheduledWorkAdapter,
    celeryScheduledWorkAdapter,
    kubernetesScheduledWorkAdapter,
    unsupportedScheduledWorkAdapter,
  ];
}

export function currentPipelineVersions(): {
  extractors: Array<{ id: string; version: string }>;
  adapters: Array<{ id: string; version: string; capability: string }>;
  toolVersion: string;
} {
  return {
    extractors: defaultExtractors().map((extractor) => ({
      id: extractor.id,
      version: extractor.version,
    })),
    adapters: defaultAdapters().map((adapter) => ({
      id: adapter.id,
      version: adapter.version,
      capability: adapter.capability,
    })),
    toolVersion: COMPILER_TOOL_VERSION,
  };
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
  const extractors = options.extractors ?? defaultExtractors();
  const contributions = await Promise.all(
    extractors.map((extractor) => runExtractor(extractor, root, files)),
  );
  const extracted = new GraphBuilder();
  for (const contribution of contributions) extracted.add(contribution);
  const snapshot = extracted.snapshot();
  const adapters = options.adapters ?? defaultAdapters();
  const adapterContributions = await Promise.all(
    adapters.map((adapter) =>
      runSemanticAdapter(adapter, {
        root,
        files,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
      }),
    ),
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

  const allContributions = [...contributions, ...adapterContributions];
  const topLevelNodes = allContributions
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
  for (const contribution of allContributions) builder.add(contribution);

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
