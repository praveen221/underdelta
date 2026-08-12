# architecture.json v0.2

v0.2 separates language/resource extraction from framework semantics. It does
not attempt to replace symbol graph providers. Symbols are optional inputs;
Underdelta owns the product/runtime ontology and its progressive projection.

## Closed semantic vocabulary

Nodes may carry typed `semantics` facets:

- `symbol`: module, class, function, or method identity
- `trigger`: cron, interval, calendar, or event declaration
- `job`: executable scheduled/queued work
- `endpoint`: HTTP method/path/provider declaration
- `resource`: database, table, collection, queue, topic, or secret
- `deploy-unit`: service, workload, serverless unit, container, scheduled workload,
  infrastructure resource, deployment package, or overlay

Role bindings are typed edges rather than exclusive node kinds. For scheduled
work the contract is:

```text
Trigger -[schedules]-> Job -[handled-by]-> Symbol
                              |
                              +-[uses]-> Deploy unit / Resource
```

A function can therefore handle HTTP, read a table, consume a queue, and run as
scheduled work without becoming four different nodes. Facets inherit the
node's evidence and certainty; binding edges carry their own evidence.

Framework-specific values have typed homes. For example, a trigger owns its
provider, expression, timezone, trigger kind, and declaration surface. These
properties must not be duplicated into open `metadata` for projection to read.

## Compiler boundary

The compiler runs in four stages:

1. Language and infrastructure extractors emit modules, symbols, resources, and wiring.
2. Semantic adapters read source plus the extracted graph and emit normalized facets/bindings.
3. Capability projection turns those facts into product systems and calm labels.
4. The viewer progressively exposes system, trigger/job, and code detail.

`architecture.json` lists `extractors` and `adapters` separately. An adapter has
an `id`, `version`, and `capability`; it must never masquerade as a language
extractor in the self-map.

## Scheduled-work v1

Supported adapters:

- Node: `node-cron`, `cron`, `@nestjs/schedule`
- Python: Celery task and beat declarations
- Infrastructure: Kubernetes `CronJob`

Known scheduler packages without an adapter produce an
`unsupported-scheduled-framework` diagnostic. Unsupported code produces no
invented trigger or job.

The capability is complete only when all of these hold:

- compact source contracts produce the normalized trigger/job/binding shape
- projection creates a Scheduled jobs system and readable schedule labels
- Beginner shows the system without code detail
- Intermediate shows trigger and job relationships
- the inspector shows provider, expression, timezone, execution kind, and handler
- Advanced can reveal the underlying handler inside the current focus

## Data-access v1

The `data-resources` adapter normalizes extractor-owned database, table, and
collection nodes into typed `resource` facets. It does not parse framework
syntax or invent resources. Existing extractors remain responsible for the
source-backed facts and emit explicit `queries`, `reads`, and `writes` bindings.

Projection owns cross-technology presentation:

- Prisma, SQL, Alembic, and SQLAlchemy table twins unify into one resource
- Mongoose and MongoDB collection aliases unify into one resource
- API and scheduled-work handlers lift their data bindings to Data access
- the inspector exposes resource kind and provider from typed facets

Neutral query operations stay `queries`; they are not guessed into reads or
writes. Migration and table-relation edges remain separate contracts.

## HTTP API v1

The `http-endpoints` adapter normalizes extractor-owned route facts into one
typed endpoint contract: protocol, method, path, provider, declaration source,
and optional operation ID/summary. Handler identity remains a `routes-to` binding so a
function can serve HTTP and carry other roles without becoming an HTTP-specific
function kind.

Supported route facts currently come from Express-style Node routers, Next.js
App Router handlers, FastAPI, Flask blueprints/URL rules, Django URL
declarations, and OpenAPI/Swagger contracts. Recognized frameworks without a dedicated route extractor produce an
`unsupported-http-framework` diagnostic instead of invented endpoints.

Projection creates one HTTP API system from typed endpoint evidence, attaches
endpoints under it, and leaves source parsing in extractors. The viewer exposes
method, path, provider, declaration source, operation ID, handler bindings, and
file evidence.

## Deployment v1

The `deploy-units` adapter normalizes existing Docker Compose, Dockerfile,
Terraform, Kubernetes, Helm, and Kustomize facts. It does not parse those
formats again. A deploy facet owns the portable role and provider plus observed
operational identity when available: native kind, name, address, namespace,
image, and ports.

Projection uses that facet, rather than technology flags, to attach deployable
units under Deploy and create calm labels. Technology-specific metadata remains
available for detailed relationships such as Compose `depends_on`, Kubernetes
selectors, Helm chart versions, and Kustomize resources. The viewer leads with
the normalized contract and links back to the extractor evidence.

## Extension rule

Do not add a declarative matcher DSL yet. Add another plain adapter module when
a supported framework is requested and validate it against a user-selected
repository with `npm run inspect -- /path/to/repo`. Generalize the adapter
interface only after repeated implementations reveal a stable abstraction.

## Product wedge (MVP freeze)

Product priority is not horizontal adapter expansion. See
[`PRODUCT_MVP.md`](PRODUCT_MVP.md): repository map for activation, deterministic
change impact for retention. Prefer reachability and impact precision (including
anonymous route handlers as the next follow-up) over new frameworks until user
gates pass.
