# architecture.json v0.2

v0.2 separates language/resource extraction from framework semantics. It does
not attempt to replace symbol graph providers. Symbols are optional inputs;
Underdelta owns the product/runtime ontology and its progressive projection.

## Closed semantic vocabulary

Nodes may carry typed `semantics` facets:

- `symbol`: module, class, function, or method identity
- `trigger`: cron, interval, calendar, or event declaration
- `job`: executable scheduled/queued work
- `resource`: database, table, collection, queue, topic, or secret
- `deploy-unit`: service, workload, serverless unit, container, or scheduled workload

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

## Extension rule

Do not add a declarative matcher DSL yet. Add another plain adapter module when
a supported framework is requested and validate it against a user-selected
repository with `npm run inspect -- /path/to/repo`. Generalize the adapter
interface only after repeated implementations reveal a stable abstraction.
