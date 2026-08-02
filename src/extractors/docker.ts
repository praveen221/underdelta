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

export interface ParsedComposeService {
  name: string;
  offset: number;
  image?: string;
  build?: string;
  ports: string[];
  dependsOn: string[];
}

type ServiceBlock = "depends_on" | "ports" | "build" | null;

function stripYamlScalar(value: string): string {
  return value.replace(/^['"]|['"]$/g, "").split(/\s+#/)[0]?.trim() ?? "";
}

/**
 * Host port from a Compose ports mapping for North-star labels.
 * `8080:80` → 8080; `127.0.0.1:9229:9229` → 9229; `3000` → 3000.
 */
export function hostPortFromMapping(mapping: string): string | undefined {
  const cleaned = stripYamlScalar(mapping).split("/")[0] ?? "";
  if (!cleaned) return undefined;
  const parts = cleaned.split(":");
  if (parts.length === 1) return parts[0] || undefined;
  if (parts.length === 2) return parts[0] || undefined;
  if (parts.length >= 3) return parts[1] || undefined;
  return undefined;
}

/** Short image label for inspector / evidence (`postgres:15-alpine` → `postgres:15-alpine`). */
export function shortImageLabel(image: string): string {
  const trimmed = image.trim();
  // Drop registry host when path is long; keep docker hub short names.
  const withoutDigest = trimmed.split("@")[0] ?? trimmed;
  return withoutDigest;
}

/**
 * Resolve Compose `build` / `build.context` to a repo-relative directory
 * that may contain a Dockerfile (so we can quiet duplicate App image nodes).
 */
export function composeBuildDirectory(
  composeFile: string,
  build: string,
): string {
  const normalizedCompose = composeFile.replaceAll("\\", "/");
  const composeDir = path.posix.dirname(normalizedCompose);
  const cleaned = build.replaceAll("\\", "/").replace(/\/$/, "") || ".";
  const joined =
    cleaned === "."
      ? composeDir === "."
        ? "."
        : composeDir
      : path.posix.normalize(
          composeDir === "." ? cleaned : `${composeDir}/${cleaned}`,
        );
  return joined === "." ? "." : joined.replace(/^\.\//, "");
}

/**
 * Prefer primary compose files (`docker-compose.yml` / `compose.yml`) over
 * overlays (`docker-compose.images.yml`) when merging same-named services.
 */
export function composeFileRank(file: string): number {
  const base = path.basename(file.replaceAll("\\", "/")).toLowerCase();
  if (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml"
  ) {
    return 0;
  }
  return 1;
}

interface MergedComposeService {
  name: string;
  image?: string;
  build?: string;
  ports: string[];
  dependsOn: string[];
  /** Compose module that owns the merged node (primary file preferred). */
  parentModuleId: string;
  /** Evidence from every compose file that defined this service (primary first). */
  evidence: Evidence[];
}

/**
 * Dependency-free Compose services walker for typical 2-space YAML.
 * Captures image / build(+context) / ports / depends_on for the Deploy story.
 */
export function parseComposeServices(source: string): ParsedComposeService[] {
  const lines = source.split(/\r?\n/);
  let inServices = false;
  let servicesIndent = 0;
  let serviceIndent: number | undefined;
  const services: ParsedComposeService[] = [];
  let current: ParsedComposeService | undefined;
  let block: ServiceBlock = null;
  let blockIndent = 0;

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

    if (serviceIndent === undefined && indent > servicesIndent) {
      serviceIndent = indent;
    }

    // New service at service indent.
    const serviceKey = /^([A-Za-z][\w-]*)\s*:/.exec(trimmed);
    if (serviceIndent !== undefined && indent === serviceIndent && serviceKey) {
      current = {
        name: serviceKey[1] ?? "",
        offset: lineOffset,
        ports: [],
        dependsOn: [],
      };
      services.push(current);
      block = null;
      continue;
    }

    if (!current || serviceIndent === undefined) continue;
    if (indent <= serviceIndent) {
      block = null;
      continue;
    }

    const keyMatch = /^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(trimmed);
    const listMatch = /^-\s+(.+?)\s*$/.exec(trimmed);

    // First-level keys under a service.
    if (indent === serviceIndent + 2 || indent === serviceIndent + 1) {
      if (!keyMatch) continue;
      const key = keyMatch[1] ?? "";
      const rest = keyMatch[2] ?? "";
      block = null;

      if (key === "image" && rest && !rest.startsWith("|") && !rest.startsWith(">")) {
        const image = stripYamlScalar(rest);
        if (image) current.image = image;
        continue;
      }

      if (key === "build") {
        if (rest && rest !== "|" && rest !== ">") {
          const build = stripYamlScalar(rest);
          if (build) current.build = build;
        } else {
          // Mapping form — wait for context: under build.
          block = "build";
          blockIndent = indent;
          if (!current.build) current.build = ".";
        }
        continue;
      }

      if (key === "ports") {
        block = "ports";
        blockIndent = indent;
        continue;
      }

      if (key === "depends_on") {
        block = "depends_on";
        blockIndent = indent;
        // Short inline: depends_on: [a, b] — rare; skip.
        continue;
      }

      continue;
    }

    if (!block || indent <= blockIndent) {
      if (indent <= blockIndent) block = null;
      continue;
    }

    // Only immediate children of the block key (skip condition:/target: nests).
    const immediate =
      indent === blockIndent + 2 || indent === blockIndent + 1;
    if (!immediate) continue;

    if (block === "build" && keyMatch) {
      const key = keyMatch[1] ?? "";
      const rest = keyMatch[2] ?? "";
      if (key === "context" && rest) {
        const context = stripYamlScalar(rest);
        if (context) current.build = context;
      }
      continue;
    }

    if (block === "ports" && listMatch) {
      const port = stripYamlScalar(listMatch[1] ?? "");
      if (port) current.ports.push(port);
      continue;
    }

    if (block === "depends_on") {
      // Map form: redis: { condition: ... } — dependency is the key.
      if (keyMatch && !listMatch) {
        const dep = keyMatch[1] ?? "";
        if (dep && !current.dependsOn.includes(dep)) {
          current.dependsOn.push(dep);
        }
        continue;
      }
      // List form: - redis
      if (listMatch) {
        const dep = stripYamlScalar(listMatch[1] ?? "");
        if (dep && !current.dependsOn.includes(dep)) {
          current.dependsOn.push(dep);
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

interface PendingCompose {
  file: string;
  source: string;
  services: ParsedComposeService[];
}

interface PendingDockerfile {
  file: string;
  source: string;
  parsed: ParsedDockerfile;
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
    const pendingCompose: PendingCompose[] = [];
    const pendingDockerfiles: PendingDockerfile[] = [];

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
        pendingCompose.push({
          file,
          source,
          services: parseComposeServices(source),
        });
        continue;
      }

      if (isDockerfilePath(file)) {
        pendingDockerfiles.push({
          file,
          source,
          parsed: parseDockerfile(source),
        });
      }
    }

    // Primary compose files first so overlay twins merge into them.
    pendingCompose.sort((a, b) => {
      const rank = composeFileRank(a.file) - composeFileRank(b.file);
      if (rank !== 0) return rank;
      return a.file.localeCompare(b.file);
    });

    // Directories whose Compose `build:` already owns the image story —
    // quiet duplicate Dockerfile "App image" nodes for those paths.
    const composeOwnedDirs = new Set<string>();
    for (const compose of pendingCompose) {
      for (const svc of compose.services) {
        if (!svc.build) continue;
        composeOwnedDirs.add(composeBuildDirectory(compose.file, svc.build));
      }
    }

    const mergedServices = new Map<string, MergedComposeService>();

    for (const compose of pendingCompose) {
      const { file, source, services } = compose;
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
        const hostPorts = svc.ports
          .map(hostPortFromMapping)
          .filter((port): port is string => Boolean(port));
        const detail = [
          `service:${svc.name}`,
          svc.image ? `image:${shortImageLabel(svc.image)}` : undefined,
          svc.build ? `build:${svc.build}` : undefined,
          hostPorts.length ? `ports:${hostPorts.join(",")}` : undefined,
          svc.dependsOn.length
            ? `depends_on:${svc.dependsOn.join(",")}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" ");
        const serviceEvidence = evidence(file, source, svc.offset, detail);
        const existing = mergedServices.get(svc.name);
        if (!existing) {
          mergedServices.set(svc.name, {
            name: svc.name,
            ...(svc.image ? { image: svc.image } : {}),
            ...(svc.build ? { build: svc.build } : {}),
            ports: [...svc.ports],
            dependsOn: [...svc.dependsOn],
            parentModuleId: moduleId,
            evidence: [serviceEvidence],
          });
          continue;
        }

        // Gap-fill from overlays: keep primary build/ports/depends, add image
        // (or missing build) so Deploy tells one Vote story with build+image.
        if (svc.image && !existing.image) existing.image = svc.image;
        if (svc.build && !existing.build) existing.build = svc.build;
        for (const port of svc.ports) {
          if (!existing.ports.includes(port)) existing.ports.push(port);
        }
        for (const dep of svc.dependsOn) {
          if (!existing.dependsOn.includes(dep)) existing.dependsOn.push(dep);
        }
        existing.evidence.push(serviceEvidence);
      }
    }

    const serviceIds = new Map<string, string>();

    for (const svc of mergedServices.values()) {
      // Identity is service name only — overlays must not twin Vote/Result.
      const serviceId = stableId("service", "docker", svc.name);
      if (seen.has(serviceId)) continue;
      seen.add(serviceId);
      serviceIds.set(svc.name, serviceId);

      const hostPorts = svc.ports
        .map(hostPortFromMapping)
        .filter((port): port is string => Boolean(port));
      const detail = [
        `service:${svc.name}`,
        svc.image ? `image:${shortImageLabel(svc.image)}` : undefined,
        svc.build ? `build:${svc.build}` : undefined,
        hostPorts.length ? `ports:${hostPorts.join(",")}` : undefined,
        svc.dependsOn.length
          ? `depends_on:${svc.dependsOn.join(",")}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      // Refresh primary evidence detail so inspector/verify see merged build+image.
      const primaryEvidence = {
        ...svc.evidence[0]!,
        detail,
      };
      const evidenceList = [primaryEvidence, ...svc.evidence.slice(1)];
      const composeFiles = [
        ...new Set(
          evidenceList
            .map((item) => item.file)
            .filter((item): item is string => Boolean(item)),
        ),
      ];

      nodes.push({
        id: serviceId,
        kind: "service",
        label: svc.name,
        technology: "docker-compose",
        parentId: svc.parentModuleId,
        metadata: {
          docker: true,
          dockerService: true,
          serviceName: svc.name,
          ...(svc.image ? { image: shortImageLabel(svc.image) } : {}),
          ...(svc.build ? { build: svc.build } : {}),
          ...(svc.ports.length ? { ports: svc.ports } : {}),
          ...(hostPorts.length ? { hostPorts } : {}),
          ...(svc.dependsOn.length ? { dependsOn: svc.dependsOn } : {}),
          ...(composeFiles.length > 1 ? { composeFiles } : {}),
        },
        evidence: evidenceList,
      });
      edges.push(
        edgeFrom("exposes", svc.parentModuleId, serviceId, primaryEvidence),
      );
    }

    // Compose depends_on → service↔service edges (Deploy runtime story).
    for (const svc of mergedServices.values()) {
      const sourceId = serviceIds.get(svc.name);
      if (!sourceId) continue;
      for (const dep of svc.dependsOn) {
        const targetId = serviceIds.get(dep);
        if (!targetId) continue;
        const depEvidence = svc.evidence[0]!;
        edges.push(
          edgeFrom(
            "depends-on",
            sourceId,
            targetId,
            {
              ...depEvidence,
              detail: `needs ${dep}`,
            },
            "needs",
          ),
        );
      }
    }

    for (const dockerfile of pendingDockerfiles) {
      const { file, source, parsed } = dockerfile;
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

      const dockerfileDir = path.posix.dirname(file.replaceAll("\\", "/"));
      const ownedByCompose = composeOwnedDirs.has(
        dockerfileDir === "" ? "." : dockerfileDir,
      );
      // Compose `build:` already names the deployable (Vote/API/…) — don't
      // invent a twin "App image" packaging node beside it.
      if (ownedByCompose) continue;

      const serviceId = stableId("service", "docker", file, "image");
      if (seen.has(serviceId)) continue;
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

    return {
      extractor: { id: "docker", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
