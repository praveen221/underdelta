import { readFile } from "node:fs/promises";
import path from "node:path";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";
import {
  looksLikeKubernetesManifest,
  parseKubernetesResources,
  type ParsedKubernetesResource,
} from "./kubernetes.js";

const extensions = new Set([".yaml", ".yml"]);

/** Workloads that own pod selectors Services can target. */
const SELECTABLE_WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
]);

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
    extractor: "helm",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

export function isHelmChartYaml(file: string): boolean {
  const base = path.basename(file.replaceAll("\\", "/")).toLowerCase();
  return base === "chart.yaml" || base === "chart.yml";
}

/** Conventional Helm chart tree paths (`charts/`, `helm/`, `helm-chart/`). */
export function isHelmChartTreePath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  return (
    /(^|\/)charts?\//.test(normalized) ||
    /(^|\/)helm(?:-?chart)?\//.test(normalized)
  );
}

/**
 * Template YAML under a chart root (`…/templates/*.yaml`).
 * Chart roots are directories via Chart.yaml — not every templates/ folder.
 */
export function isHelmTemplateUnderRoot(
  file: string,
  chartRoot: string,
): boolean {
  const normalized = file.replaceAll("\\", "/");
  const root = chartRoot.replaceAll("\\", "/").replace(/\/$/, "");
  const prefix = root === "." ? "templates/" : `${root}/templates/`;
  if (!normalized.startsWith(prefix) && normalized !== prefix.slice(0, -1)) {
    // Case-insensitive path compare for Windows-ish trees.
    const lower = normalized.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();
    if (!lower.startsWith(lowerPrefix)) return false;
  }
  return /\.ya?ml$/i.test(normalized);
}

export function isHelmPath(file: string): boolean {
  return isHelmChartYaml(file) || isHelmChartTreePath(file);
}

export interface ParsedHelmChart {
  name: string;
  offset: number;
  version?: string;
  appVersion?: string;
  description?: string;
}

/**
 * Dependency-free Chart.yaml walker — typical Helm v2 chart metadata only.
 */
export function parseHelmChartYaml(source: string): ParsedHelmChart | undefined {
  // Skip Go-templated chart stubs.
  if (/\{\{/.test(source.slice(0, 400))) {
    // Still allow charts whose description mentions templates but name is concrete.
  }
  const nameMatch = /^\s*name\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const name = nameMatch?.[1]?.trim();
  if (!name || /\{\{/.test(name)) return undefined;
  const versionMatch =
    /^\s*version\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const appVersionMatch =
    /^\s*appVersion\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  const descriptionMatch =
    /^\s*description\s*:\s*["']?([^"'#\n]+?)["']?\s*$/m.exec(source);
  return {
    name,
    offset: nameMatch?.index ?? 0,
    ...(versionMatch?.[1]?.trim()
      ? { version: versionMatch[1].trim() }
      : {}),
    ...(appVersionMatch?.[1]?.trim()
      ? { appVersion: appVersionMatch[1].trim() }
      : {}),
    ...(descriptionMatch?.[1]?.trim()
      ? { description: descriptionMatch[1].trim() }
      : {}),
  };
}

function labelsMatch(
  selector: Record<string, string>,
  target: Record<string, string>,
): boolean {
  const keys = Object.keys(selector);
  if (keys.length === 0) return false;
  return keys.every((key) => target[key] === selector[key]);
}

/**
 * Concrete (non-templated) Kubernetes resources from a Helm template file.
 * Keeps Online Boutique `{{ .Values… }}` names out of the product map.
 */
export function parseHelmTemplateResources(
  source: string,
): ParsedKubernetesResource[] {
  if (!looksLikeKubernetesManifest(source)) return [];
  return parseKubernetesResources(source).filter(
    (resource) => !/\{\{/.test(resource.name),
  );
}

export const helmExtractor: ArchitectureExtractor = {
  id: "helm",
  version: "0.1.0",
  extensions,
  matchesFile: isHelmPath,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();
    const resourcesById = new Map<
      string,
      ParsedKubernetesResource & {
        id: string;
        file: string;
        chartName: string;
      }
    >();

    // Pass 1: discover Chart.yaml roots (product chart identity).
    type ChartRoot = {
      root: string;
      chartFile: string;
      chart: ParsedHelmChart;
      source: string;
    };
    const chartRoots: ChartRoot[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      if (!isHelmChartYaml(file)) continue;
      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }
      const chart = parseHelmChartYaml(source);
      if (!chart) continue;
      const root = path.posix.dirname(file.replaceAll("\\", "/"));
      chartRoots.push({ root, chartFile: file, chart, source });
    }

    for (const { root, chartFile, chart, source } of chartRoots) {
      const moduleId = stableId("module", "helm", chartFile);
      const moduleEvidence = evidence(
        chartFile,
        source,
        0,
        "Helm Chart.yaml",
      );
      if (!seen.has(moduleId)) {
        seen.add(moduleId);
        nodes.push({
          id: moduleId,
          kind: "module",
          label: chartFile,
          qualifiedName: chartFile,
          technology: "helm",
          metadata: {
            helm: true,
            helmModule: true,
            helmChartYaml: true,
            file: chartFile,
            chartName: chart.name,
            chartRoot: root,
          },
          evidence: [moduleEvidence],
        });
      }

      const chartAddress = `Chart/${chart.name}`;
      const chartId = stableId("service", "helm", "chart", root, chart.name);
      if (!seen.has(chartId)) {
        seen.add(chartId);
        const detailParts = [`chart:${chart.name}`];
        if (chart.version) detailParts.push(`version:${chart.version}`);
        if (chart.appVersion) detailParts.push(`appVersion:${chart.appVersion}`);
        const chartEvidence = evidence(
          chartFile,
          source,
          chart.offset,
          detailParts.join(" "),
        );
        nodes.push({
          id: chartId,
          kind: "service",
          label: chartAddress,
          qualifiedName: chartAddress,
          technology: "helm",
          parentId: moduleId,
          metadata: {
            helm: true,
            helmChart: true,
            chartName: chart.name,
            address: chartAddress,
            ...(chart.version ? { chartVersion: chart.version } : {}),
            ...(chart.appVersion ? { appVersion: chart.appVersion } : {}),
            ...(chart.description ? { description: chart.description } : {}),
            chartRoot: root,
          },
          evidence: [chartEvidence],
        });
        edges.push(edgeFrom("exposes", moduleId, chartId, chartEvidence));
      }
    }

    // Pass 2: concrete template resources under each chart's templates/.
    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const normalized = file.replaceAll("\\", "/");
      const ext = path.extname(normalized).toLowerCase();
      if (ext !== ".yaml" && ext !== ".yml") continue;
      if (isHelmChartYaml(file)) continue;

      const owning = chartRoots.find((entry) =>
        isHelmTemplateUnderRoot(normalized, entry.root),
      );
      if (!owning) continue;

      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      const resources = parseHelmTemplateResources(source);
      if (resources.length === 0) continue;

      const moduleId = stableId("module", "helm", file);
      const moduleEvidence = evidence(file, source, 0, "Helm template");
      if (!seen.has(moduleId)) {
        seen.add(moduleId);
        nodes.push({
          id: moduleId,
          kind: "module",
          label: file,
          qualifiedName: file,
          technology: "helm",
          metadata: {
            helm: true,
            helmModule: true,
            helmTemplate: true,
            file,
            chartName: owning.chart.name,
            chartRoot: owning.root,
          },
          evidence: [moduleEvidence],
        });
      }

      for (const resource of resources) {
        // Skip any remaining Go-template chrome in host/backend wiring too.
        if (resource.hosts?.some((host) => /\{\{/.test(host))) {
          resource.hosts = resource.hosts.filter((host) => !/\{\{/.test(host));
          if (!resource.hosts.length) delete resource.hosts;
        }
        if (resource.backendServices?.some((name) => /\{\{/.test(name))) {
          resource.backendServices = resource.backendServices.filter(
            (name) => !/\{\{/.test(name),
          );
          if (!resource.backendServices.length) delete resource.backendServices;
        }

        const address = resource.namespace
          ? `${resource.kind}/${resource.namespace}/${resource.name}`
          : `${resource.kind}/${resource.name}`;
        // Chart-scoped ids so two charts can ship the same Deployment/api.
        const resourceId = stableId(
          "service",
          "helm",
          owning.chart.name,
          address,
        );
        if (seen.has(resourceId)) continue;
        seen.add(resourceId);
        const detailParts = [`kind:${resource.kind} name:${resource.name}`];
        if (resource.hosts?.length) {
          detailParts.push(`hosts:${resource.hosts.join(",")}`);
        }
        if (resource.backendServices?.length) {
          detailParts.push(`backends:${resource.backendServices.join(",")}`);
        }
        const resourceEvidence = evidence(
          file,
          source,
          resource.offset,
          detailParts.join(" "),
        );
        nodes.push({
          id: resourceId,
          kind: "service",
          label: `${resource.kind}/${resource.name}`,
          qualifiedName: `${owning.chart.name}/${address}`,
          technology: "helm",
          parentId: moduleId,
          metadata: {
            helm: true,
            helmResource: true,
            apiVersion: resource.apiVersion,
            k8sKind: resource.kind,
            resourceName: resource.name,
            address,
            chartName: owning.chart.name,
            chartRoot: owning.root,
            ...(resource.namespace ? { namespace: resource.namespace } : {}),
            ...(resource.selector ? { selector: resource.selector } : {}),
            ...(resource.matchLabels
              ? { matchLabels: resource.matchLabels }
              : {}),
            ...(resource.hosts?.length ? { hosts: resource.hosts } : {}),
            ...(resource.backendServices?.length
              ? { backendServices: resource.backendServices }
              : {}),
          },
          evidence: [resourceEvidence],
        });
        edges.push(
          edgeFrom("exposes", moduleId, resourceId, resourceEvidence),
        );
        resourcesById.set(resourceId, {
          ...resource,
          id: resourceId,
          file,
          chartName: owning.chart.name,
        });
      }
    }

    // Service selector → Deployment needs (same-chart only).
    const workloads = [...resourcesById.values()].filter((resource) =>
      SELECTABLE_WORKLOAD_KINDS.has(resource.kind),
    );
    const services = [...resourcesById.values()].filter(
      (resource) => resource.kind === "Service",
    );
    for (const service of services) {
      if (!service.selector) continue;
      for (const workload of workloads) {
        if (service.chartName !== workload.chartName) continue;
        if (!workload.matchLabels) continue;
        if (
          service.namespace &&
          workload.namespace &&
          service.namespace !== workload.namespace
        ) {
          continue;
        }
        if (!labelsMatch(service.selector, workload.matchLabels)) continue;
        const realEvidence = nodes.find((node) => node.id === service.id)
          ?.evidence[0];
        edges.push(
          edgeFrom(
            "depends-on",
            service.id,
            workload.id,
            {
              ...(realEvidence ??
                evidence(
                  service.file,
                  "",
                  0,
                  `needs ${workload.kind}/${workload.name}`,
                )),
              detail: `needs ${workload.kind}/${workload.name}`,
            },
            "needs",
          ),
        );
      }
    }

    // Ingress backend → Service needs (same-chart only).
    const ingresses = [...resourcesById.values()].filter(
      (resource) => resource.kind === "Ingress",
    );
    for (const ingress of ingresses) {
      for (const backendName of ingress.backendServices ?? []) {
        if (/\{\{/.test(backendName)) continue;
        const target = services.find((service) => {
          if (service.chartName !== ingress.chartName) return false;
          if (service.name !== backendName) return false;
          if (
            ingress.namespace &&
            service.namespace &&
            ingress.namespace !== service.namespace
          ) {
            return false;
          }
          return true;
        });
        if (!target) continue;
        const realEvidence = nodes.find((node) => node.id === ingress.id)
          ?.evidence[0];
        edges.push(
          edgeFrom(
            "depends-on",
            ingress.id,
            target.id,
            {
              ...(realEvidence ??
                evidence(
                  ingress.file,
                  "",
                  0,
                  `needs Service/${backendName}`,
                )),
              detail: `needs Service/${backendName}`,
            },
            "needs",
          ),
        );
      }
    }

    return {
      extractor: { id: "helm", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
