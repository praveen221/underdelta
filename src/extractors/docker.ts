import { readFile } from "node:fs/promises";
import path from "node:path";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

/** Compose YAML extensions; Dockerfiles are matched via matchesFile. */
const extensions = new Set([".yml", ".yaml", ""]);

function evidence(
  file: string,
  source: string,
  offset: number,
  detail?: string,
): Evidence {
  const before = source.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const item: Evidence = {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor: "docker",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

/** Conventional Docker Compose filenames. */
export function isDockerComposePath(file: string): boolean {
  const base = path.basename(file.replaceAll("\\", "/")).toLowerCase();
  return (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml" ||
    /^docker-compose\.[^/]+\.ya?ml$/.test(base)
  );
}

/** Dockerfile / Dockerfile.* / *.dockerfile. */
export function isDockerfilePath(file: string): boolean {
  const base = path.basename(file.replaceAll("\\", "/"));
  const lower = base.toLowerCase();
  return (
    lower === "dockerfile" ||
    lower.startsWith("dockerfile.") ||
    lower.endsWith(".dockerfile")
  );
}

export function isDockerPath(file: string): boolean {
  return isDockerComposePath(file) || isDockerfilePath(file);
}

interface ParsedComposeService {
  name: string;
  offset: number;
  image?: string;
  build?: string;
}

/**
 * Dependency-free Compose services walker for typical 2-space YAML.
 * Stops at the next top-level key (volumes/networks/…).
 */
export function parseComposeServices(source: string): ParsedComposeService[] {
  const lines = source.split(/\r?\n/);
  let inServices = false;
  let servicesIndent = 0;
  let serviceIndent: number | undefined;
  const services: ParsedComposeService[] = [];
  let current: ParsedComposeService | undefined;

  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineOffset = offset;
    offset += line.length + 1;

    const indent = /^(\s*)/.exec(line)?.[1]?.length ?? 0;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!inServices) {
      if (indent === 0 && /^services\s*:/.test(trimmed)) {
        inServices = true;
        servicesIndent = 0;
      }
      continue;
    }

    // Next top-level key ends the services block.
    if (indent === servicesIndent && /^[A-Za-z][\w-]*\s*:/.test(trimmed)) {
      break;
    }

    const keyMatch = /^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(trimmed);
    if (!keyMatch) continue;
    const key = keyMatch[1] ?? "";
    const rest = keyMatch[2] ?? "";

    if (serviceIndent === undefined && indent > servicesIndent) {
      serviceIndent = indent;
    }

    if (serviceIndent !== undefined && indent === serviceIndent) {
      current = { name: key, offset: lineOffset };
      services.push(current);
      continue;
    }

    if (!current || serviceIndent === undefined) continue;
    if (indent <= serviceIndent) continue;

    // First-level keys under a service: image / build.
    if (indent === serviceIndent + 2 || indent === serviceIndent + 1) {
      if (key === "image" && rest && !rest.startsWith("|") && !rest.startsWith(">")) {
        const image = rest.replace(/^['"]|['"]$/g, "").split(/\s+#/)[0]?.trim();
        if (image) current.image = image;
      }
      if (key === "build") {
        if (rest && rest !== "|" && rest !== ">") {
          const build = rest.replace(/^['"]|['"]$/g, "").trim();
          if (build) current.build = build;
        } else {
          current.build = ".";
        }
      }
    }
  }

  return services;
}

interface ParsedDockerfile {
  from?: string;
  expose: string[];
  offset: number;
}

export function parseDockerfile(source: string): ParsedDockerfile {
  const fromMatch = /^\s*FROM\s+(\S+)/im.exec(source);
  const expose: string[] = [];
  for (const match of source.matchAll(/^\s*EXPOSE\s+(.+)$/gim)) {
    const ports = (match[1] ?? "")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    expose.push(...ports);
  }
  return {
    ...(fromMatch?.[1] ? { from: fromMatch[1] } : {}),
    expose,
    offset: fromMatch?.index ?? 0,
  };
}

export const dockerExtractor: ArchitectureExtractor = {
  id: "docker",
  version: "0.1.0",
  extensions,
  matchesFile: isDockerPath,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      if (!isDockerPath(file)) continue;

      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      if (isDockerComposePath(file)) {
        const services = parseComposeServices(source);
        const moduleId = stableId("module", "docker", file);
        const moduleEvidence = evidence(
          file,
          source,
          0,
          "Docker Compose services",
        );
        if (!seen.has(moduleId)) {
          seen.add(moduleId);
          nodes.push({
            id: moduleId,
            kind: "module",
            label: file,
            qualifiedName: file,
            technology: "docker-compose",
            metadata: {
              dockerCompose: true,
              dockerModule: true,
            },
            evidence: [moduleEvidence],
          });
        }

        for (const svc of services) {
          const serviceId = stableId("service", "docker", file, svc.name);
          if (seen.has(serviceId)) continue;
          seen.add(serviceId);
          const detail = [
            `service:${svc.name}`,
            svc.image ? `image:${svc.image}` : undefined,
            svc.build ? `build:${svc.build}` : undefined,
          ]
            .filter(Boolean)
            .join(" ");
          const serviceEvidence = evidence(file, source, svc.offset, detail);
          nodes.push({
            id: serviceId,
            kind: "service",
            label: svc.name,
            technology: "docker-compose",
            parentId: moduleId,
            metadata: {
              docker: true,
              dockerService: true,
              serviceName: svc.name,
              ...(svc.image ? { image: svc.image } : {}),
              ...(svc.build ? { build: svc.build } : {}),
            },
            evidence: [serviceEvidence],
          });
          edges.push(edgeFrom("exposes", moduleId, serviceId, serviceEvidence));
        }
        continue;
      }

      if (isDockerfilePath(file)) {
        const parsed = parseDockerfile(source);
        const moduleId = stableId("module", "docker", file);
        const moduleEvidence = evidence(file, source, 0, "Dockerfile");
        if (!seen.has(moduleId)) {
          seen.add(moduleId);
          nodes.push({
            id: moduleId,
            kind: "module",
            label: file,
            qualifiedName: file,
            technology: "dockerfile",
            metadata: {
              dockerfile: true,
              dockerModule: true,
              ...(parsed.from ? { from: parsed.from } : {}),
              ...(parsed.expose.length ? { expose: parsed.expose } : {}),
            },
            evidence: [moduleEvidence],
          });
        }

        // Standalone image build target — product word for the container recipe.
        const serviceId = stableId("service", "docker", file, "image");
        if (!seen.has(serviceId)) {
          seen.add(serviceId);
          const detail = [
            "dockerfile",
            parsed.from ? `from:${parsed.from}` : undefined,
            parsed.expose.length ? `expose:${parsed.expose.join(",")}` : undefined,
          ]
            .filter(Boolean)
            .join(" ");
          const serviceEvidence = evidence(
            file,
            source,
            parsed.offset,
            detail,
          );
          nodes.push({
            id: serviceId,
            kind: "service",
            label: "App image",
            technology: "dockerfile",
            parentId: moduleId,
            metadata: {
              docker: true,
              dockerfileService: true,
              ...(parsed.from ? { from: parsed.from } : {}),
              ...(parsed.expose.length ? { expose: parsed.expose } : {}),
            },
            evidence: [serviceEvidence],
          });
          edges.push(edgeFrom("exposes", moduleId, serviceId, serviceEvidence));
        }
      }
    }

    return {
      extractor: { id: "docker", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
