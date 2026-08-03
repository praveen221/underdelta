/**
 * Deterministic detection surfaces per Underdelta extractor.
 *
 * This is the Capability Attempt (v1) catalog: not AI product naming —
 * a fixed "what this capability detects" list, golden-lockable in verify.
 * Surfaces are projected as children of each extractor capability node.
 */

export type DetectionSurface = {
  id: string;
  label: string;
  detail: string;
};

/** Extractor id → ordered detection surfaces shown when that capability is focused. */
export const EXTRACTOR_DETECTION_SURFACES: Record<string, DetectionSurface[]> = {
  typescript: [
    {
      id: "modules",
      label: "Modules",
      detail: "Source files as architecture modules",
    },
    {
      id: "routes",
      label: "HTTP routes",
      detail: "Express and framework route handlers",
    },
    {
      id: "ui",
      label: "UI pages & components",
      detail: "Pages, layouts, and feature-root components (leaf chrome omitted)",
    },
    {
      id: "hooks",
      label: "Hooks",
      detail: "React use* hooks",
    },
    {
      id: "jobs",
      label: "Cron & queues",
      detail: "Scheduled jobs and queue publishers/consumers",
    },
    {
      id: "functions",
      label: "Functions",
      detail: "Named functions inside modules (Advanced drill)",
    },
  ],
  python: [
    {
      id: "routes",
      label: "HTTP routes",
      detail: "FastAPI / Django routes",
    },
    {
      id: "models",
      label: "ORM models",
      detail: "SQLAlchemy (and similar) models as tables",
    },
    {
      id: "jobs",
      label: "Jobs & cron",
      detail: "Celery tasks and scheduled jobs",
    },
    {
      id: "migrations",
      label: "Migrations",
      detail: "Alembic / schema migration lineage",
    },
  ],
  prisma: [
    {
      id: "models",
      label: "Models / tables",
      detail: "Prisma models projected as tables",
    },
    {
      id: "columns",
      label: "Columns",
      detail: "Model fields",
    },
    {
      id: "relations",
      label: "Relations",
      detail: "Table↔table relationships",
    },
  ],
  sql: [
    {
      id: "migrations",
      label: "Migrations",
      detail: "SQL migration files as schema lineage",
    },
    {
      id: "tables",
      label: "Tables",
      detail: "CREATE TABLE targets",
    },
    {
      id: "columns",
      label: "Columns",
      detail: "Column definitions in migrations",
    },
  ],
  mongo: [
    {
      id: "collections",
      label: "Collections",
      detail: "MongoDB collection usage",
    },
    {
      id: "aggregates",
      label: "Aggregates",
      detail: "Aggregation pipelines and stages",
    },
  ],
  openapi: [
    {
      id: "paths",
      label: "Paths / operations",
      detail: "OpenAPI path operations as routes",
    },
    {
      id: "contracts",
      label: "API contract",
      detail: "Swagger / OpenAPI document modules",
    },
  ],
  graphql: [
    {
      id: "operations",
      label: "Operations",
      detail: "GraphQL queries, mutations, subscriptions",
    },
    {
      id: "schema",
      label: "Schema document",
      detail: "SDL / schema modules",
    },
  ],
  docker: [
    {
      id: "services",
      label: "Compose services",
      detail: "docker-compose services",
    },
    {
      id: "images",
      label: "Images / Dockerfiles",
      detail: "Image builds and base images",
    },
    {
      id: "ports",
      label: "Ports",
      detail: "Published host/container ports",
    },
  ],
  terraform: [
    {
      id: "resources",
      label: "Resources",
      detail: "Terraform resource blocks",
    },
    {
      id: "modules",
      label: "Modules",
      detail: "Terraform module calls",
    },
  ],
  kubernetes: [
    {
      id: "deployment",
      label: "Deployment",
      detail: "Workload controllers",
    },
    {
      id: "service",
      label: "Service",
      detail: "Cluster networking Services",
    },
    {
      id: "ingress",
      label: "Ingress",
      detail: "HTTP(S) ingress rules",
    },
    {
      id: "config",
      label: "Config & secrets",
      detail: "ConfigMaps / Secrets when present",
    },
  ],
  helm: [
    {
      id: "chart",
      label: "Chart",
      detail: "Chart.yaml metadata",
    },
    {
      id: "templates",
      label: "Templates",
      detail: "Templated Kubernetes resources",
    },
  ],
  kustomize: [
    {
      id: "overlay",
      label: "Overlays",
      detail: "Overlay kustomization roots",
    },
    {
      id: "base",
      label: "Bases",
      detail: "Base kustomization roots",
    },
    {
      id: "resources",
      label: "Resources",
      detail: "Resources listed by kustomization",
    },
  ],
};

export function detectionSurfacesForExtractor(
  extractorId: string,
): DetectionSurface[] {
  return EXTRACTOR_DETECTION_SURFACES[extractorId] ?? [];
}
