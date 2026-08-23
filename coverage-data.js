/**
 * Underdelta semantic coverage catalog.
 *
 * Maintain this when extractors or adapters change. Depth meanings:
 *   deep        — typed product facts (endpoints, writes, impact)
 *   partial     — extracted and normalized, weaker reachability/binding
 *   syntax      — AST/symbols only; not a product role
 *   detect-only — unsupported-* diagnostic; nothing invented
 *   none        — invisible, or a generic call/function
 *
 * Keep HTTP detect-only names aligned with src/adapters/http/unsupported.ts
 * Keep scheduler detect-only names aligned with src/adapters/scheduled/unsupported.ts
 */
window.UNDERDELTA_COVERAGE = {
  updated: "2026-08-24",
  legend: [
    {
      id: "deep",
      label: "Deep",
      meaning: "Typed product facts. Query writes/impact can use them.",
    },
    {
      id: "partial",
      label: "Partial",
      meaning: "Extracted and labeled; bindings or reachability are thinner.",
    },
    {
      id: "syntax",
      label: "Syntax",
      meaning: "Language symbols only. Not a product role.",
    },
    {
      id: "detect-only",
      label: "Detect-only",
      meaning: "We name the stack and refuse to invent structure.",
    },
    {
      id: "none",
      label: "None",
      meaning: "Not in the ontology. Shows up as a function or unresolved call.",
    },
  ],
  categories: [
    {
      id: "http",
      label: "HTTP / API",
      summary: "Product endpoints. Unsupported frameworks stay unknown.",
      stacks: [
        {
          name: "Express",
          depth: "deep",
          detail:
            "Typed endpoints, named and inline handlers, cross-file service → route impact.",
        },
        {
          name: "Next.js App Router",
          depth: "partial",
          detail:
            "route.ts handlers, pages, layouts, server actions. Less proven than Express RealWorld.",
        },
        {
          name: "FastAPI",
          depth: "partial",
          detail: "Decorator routes as endpoints. Python impact is weaker than TypeScript.",
        },
        {
          name: "Flask",
          depth: "partial",
          detail: "Blueprints, URL rules, MethodView. Mount prefixes normalized.",
        },
        {
          name: "Django",
          depth: "partial",
          detail: "URL routes as endpoints. Not a full Django product map.",
        },
        {
          name: "OpenAPI / Swagger",
          depth: "partial",
          detail: "Contract operations as endpoints (declaration: contract).",
        },
        {
          name: "GraphQL SDL",
          depth: "partial",
          detail: "Queries, mutations, subscriptions as schema operations — not HTTP story edges.",
        },
        {
          name: "tRPC / createRouter",
          depth: "syntax",
          detail: "Vue-style router parsing exists. No typed RPC facet.",
        },
        {
          name: "Fastify, Nest, Koa, Hono, hapi, Restify, Elysia",
          depth: "detect-only",
          detail: "unsupported-http-framework. No invented endpoints.",
        },
        {
          name: "Sanic, aiohttp, Falcon, Tornado, Litestar",
          depth: "detect-only",
          detail: "Python HTTP detect-only. Same refusal.",
        },
      ],
    },
    {
      id: "data",
      label: "Data",
      summary: "Tables and collections with reads/writes/queries when observed.",
      stacks: [
        {
          name: "Prisma (usage + schema)",
          depth: "deep",
          detail:
            "Models, fields, relations; prisma.model.create/findMany become writes/reads. query writes works.",
        },
        {
          name: "SQL migrations",
          depth: "partial",
          detail: "CREATE TABLE / columns. Unify with Prisma twins when both exist.",
        },
        {
          name: "MongoDB / Mongoose",
          depth: "partial",
          detail: "Collections and aggregate pipelines.",
        },
        {
          name: "SQLAlchemy / Alembic",
          depth: "partial",
          detail: "ORM models and migrations as tables. Weaker than Prisma on TS.",
        },
      ],
    },
    {
      id: "jobs",
      label: "Jobs / messaging",
      summary: "Triggers, jobs, queues. Unknown schedulers are diagnostics.",
      stacks: [
        {
          name: "node-cron, cron, @nestjs/schedule",
          depth: "partial",
          detail: "Trigger → job → handler contract.",
        },
        {
          name: "Celery + beat",
          depth: "partial",
          detail: "Task and periodic declarations. Same scheduled-work contract.",
        },
        {
          name: "Kubernetes CronJob",
          depth: "partial",
          detail: "Infra schedule as trigger/job.",
        },
        {
          name: "BullMQ (Queue / Worker)",
          depth: "partial",
          detail: "Publish/consume as syntax-level queue edges.",
        },
        {
          name: "agenda, bree, node-schedule, APScheduler, django-q, rq-scheduler",
          depth: "detect-only",
          detail: "unsupported-scheduled-framework. No invented jobs.",
        },
      ],
    },
    {
      id: "frontend",
      label: "Frontend",
      summary: "Pages and feature roots. Leaf chrome stays Advanced.",
      stacks: [
        {
          name: "Next.js App Router UI",
          depth: "partial",
          detail: "Pages, layouts, some FE→API story edges.",
        },
        {
          name: "Vue Router",
          depth: "partial",
          detail: "createRouter pages and routes-to view modules.",
        },
        {
          name: "React components / hooks",
          depth: "syntax",
          detail: "Symbols exist. Beginner hides code orphans.",
        },
      ],
    },
    {
      id: "languages",
      label: "Languages",
      summary: "TypeScript is the validation stack. Python is thinner. Nothing else compiles.",
      stacks: [
        {
          name: "TypeScript / JavaScript",
          depth: "deep",
          detail:
            "Modules, exports, imports, calls, unresolved/ambiguous. Product slice is Express + Prisma.",
        },
        {
          name: "Python",
          depth: "partial",
          detail: "Routes, ORM, Celery. Call reachability is weaker than TS.",
        },
        {
          name: "Go, Java, Ruby, PHP, C#, …",
          depth: "none",
          detail: "No extractor. Frozen until user gates pass.",
        },
      ],
    },
    {
      id: "deploy",
      label: "Deploy",
      summary: "Units for the deploy lane. Not the product map.",
      stacks: [
        {
          name: "Docker / Compose",
          depth: "partial",
          detail: "Services, images, ports as deploy-units.",
        },
        {
          name: "Terraform",
          depth: "partial",
          detail: "Resources and modules as deploy-units.",
        },
        {
          name: "Kubernetes",
          depth: "partial",
          detail: "Workloads, Services, CronJobs. Ingress when present.",
        },
        {
          name: "Helm",
          depth: "partial",
          detail: "Chart identity and templated resources.",
        },
        {
          name: "Kustomize",
          depth: "partial",
          detail: "Overlay → base dependencies.",
        },
      ],
    },
    {
      id: "ai",
      label: "AI in the product",
      summary:
        "No completion/agent/harness facet. Frozen: not LangChain/OpenAI adapters as a breadth play.",
      stacks: [
        {
          name: "OpenAI / Anthropic / Vercel AI SDK generateText",
          depth: "none",
          detail:
            "A function call or unresolved callee. Not an LLM step. Not a model node.",
        },
        {
          name: "LangChain / LangGraph / custom agent loops",
          depth: "none",
          detail: "Explicit freeze. Would look like LangSmith if we typed it loosely.",
        },
        {
          name: "Tools, MCP, harnesses, evals, traces",
          depth: "none",
          detail: "Not in the closed vocabulary. query unknown is the honest surface.",
        },
      ],
    },
  ],
};
