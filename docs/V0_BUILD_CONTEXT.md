# Underdelta v0 — Build Context

> Historical record: this document predates the local test-suite reduction.
> References to `verification/`, pinned real repositories, and the former
> monolithic verifier describe the v0 build process, not the current test
> workflow. Use the root README for current commands.

Historical context for the capability build executed on branch
`cursor/visual-system-browser-7649` (2026-08-02). Use this file to understand
what shipped, what is frozen, and what future work should (and should not) do.

**Branch:** `cursor/visual-system-browser-7649`  
**Freeze date:** 2026-08-02  
**Status:** v0 scope frozen — no new capability ladder rungs on this branch  
**Product question:** *What did I actually build?*

---

## What this product is

Underdelta compiles a repository into an evidence-backed architecture model
(`architecture.json` + navigable `index.html`). Every visual claim links back
to source. The default browser is the product surface: it must read as a mind
map for non-coders (designers, PMs, founders vibe-coding with agents), not as
a debugger dump.

**Twin engines (locked product principles):**

1. **Capability** — extract and project real stacks (app + deploy).
2. **Polish** — legibility, hierarchy, and calm in the default browser.

A capability is not done until its map is golden-locked *and* cold-readable.

**Standing guarantee:** `scan .` (Underdelta self-map) and
`verification/mini-stack` must stay demo-ready. Regressions there outrank new
extractors.

---

## How to try it

```bash
git checkout cursor/visual-system-browser-7649
npm ci
npm run build
npm run verify
node dist/cli.js scan .
# open .underdelta/index.html
```

Optional scans:

```bash
node dist/cli.js scan verification/mini-stack -o .underdelta-verify
node dist/cli.js scan verification/mini-next -o .underdelta-verify-next
# Real-repo pins clone on demand into gitignored .underdelta-real/ via verify
```

---

## v0 capability ladder (complete — frozen)

Each rung: extractor + mini fixture + pinned real OSS repo @ SHA + golden locks
in `npm run verify` + North-star polish pass.

| Rung | Capability | Real pin (SHA) | Cache |
|------|------------|----------------|-------|
| 1 | Node/Express + Prisma/SQL | `gothinkster/node-express-realworld-example-app` @ `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b` | `.underdelta-real/node-express-realworld` |
| 2 | Next.js App Router | `nextjs/saas-starter` @ `6e33e58b1e553a41fe22e6b941a7229a002de361` | `.underdelta-real/nextjs-saas-starter` |
| 3 | Python (FastAPI/Django/Celery/Alembic) | `nsidnev/fastapi-realworld-example-app` @ `029eb7781c60d5f563ee8990a0cbfb79b244538c` | `.underdelta-real/fastapi-realworld` |
| 4 | MongoDB collections + aggregates | `sahat/hackathon-starter` @ `d20161b9e81e817d38b3633e08349f327b01d974` | `.underdelta-real/hackathon-starter` |
| 5 | OpenAPI / Swagger | `swagger-api/swagger-petstore` @ `8f0dd286987880b4af7bce552aca3813166f3049` | `.underdelta-real/swagger-petstore` |
| 6 | GraphQL SDL + documents | `zth/graphql-client-example-server` @ `814f2ba089368c29f433dc395fe169ae52740a46` | `.underdelta-real/graphql-client-example-server` |
| 7 | Docker / Compose | `dockersamples/example-voting-app` @ `63e9150ca17af4ed05880d4245e486481f73fcb4` | `.underdelta-real/example-voting-app` |
| 8 | Terraform | `terraform-aws-modules/terraform-aws-vpc` @ `3ffbd46fb1c7733e1b34d8666893280454e27436` | `.underdelta-real/terraform-aws-vpc` |
| 9 | Kubernetes manifests | `GoogleCloudPlatform/microservices-demo` @ `9a4616e77f0f9cbcbecaf27d711c38890dda1404` | `.underdelta-real/microservices-demo` |
| 10 | Helm charts | `helm/examples` @ `4888ba8fb8180dd0c36d1e84c1fcafc6efd81532` | `.underdelta-real/helm-examples` |
| 11 | Kustomize bases/overlays | `stefanprodan/podinfo` @ `eec06d1ea459af4cb4e10e806f8be7c7bd58b361` | `.underdelta-real/podinfo` |

**Rung 11 lock notes (final tick on this branch):**

- Nest kubernetes Deployments/Services/Ingress under owning Base/Overlay hubs
- Legacy `bases:` key + `namePrefix` / namespace on Overlay hubs (golden-locked
  on `verification/mini-kustomize`)
- Deploy-led flowOrder for overlay-only maps (no false HTTP API from
  `kustomize/bases/api` path-role)
- `kustomize/components/` is packaging chrome beside kubernetes-manifests;
  product trees under `kustomize/bases|overlays` are not

---

## Extractors & fixtures in tree

| Extractor | Fixture |
|-----------|---------|
| `typescript` | `verification/mini-stack`, `verification/mini-next` |
| `prisma` / `sql` | `verification/mini-stack` |
| `python` | `verification/mini-python` |
| `mongo` | `verification/mini-mongo` |
| `openapi` | `verification/mini-openapi` |
| `graphql` | `verification/mini-graphql` |
| `docker` | `verification/mini-docker` |
| `terraform` | `verification/mini-terraform` |
| `kubernetes` | `verification/mini-k8s` |
| `helm` | `verification/mini-helm` |
| `kustomize` | `verification/mini-kustomize` |

Core pipeline: `src/cli.ts` → `compile.ts` → extractors → `graph.ts` →
`project.ts` (semantic projection) → `viewer.ts` → `.underdelta/{architecture.json,index.html}`.

Real-repo clones are gitignored (`.underdelta-real/`); `scripts/ensure-real-repo.mjs`
pins SHAs for verify. They never appear in a product scan of this repo.

---

## Freeze rules (for anyone continuing this branch)

1. **Do not add Rung 12+** on this PR/branch. New stacks belong in a later
   effort after v0 is merged and tried.
2. Allowed post-freeze work: verify green, docs/README accuracy, self-map /
   mini-stack polish, merge hygiene, bugfixes that protect golden locks.
3. Do not reintroduce an unattended “never-idle ladder” loop against this
   context file. Autopilot tick protocol lived in the former
   `docs/AUTOPILOT_PLAN.md` and is retired.
4. Prefer one commit that pairs code + this context when changing locks.

---

## Suggested future work (after merge / try)

Not in v0 scope — park here:

- GraphQL `schema { query: Root }` / `extend type Query` if a pin needs it
- OAS3 `$ref` / `servers` resolution depth
- Self-map cold-read polish (remaining jargon / inspector chrome)
- Performance if real-repo scans become painful
- Next product loop: stabilize UX, package CLI, decide public surface

---

## Merge / try checklist

- [ ] Automation / push-retrigger loop is **off**
- [ ] `npm run build` and `npm run verify` green (network OK for real-repo pins)
- [ ] Open self-map (`.underdelta/index.html`) — demo-ready cold read
- [ ] Spot-check 2–3 real pins or mini fixtures you care about
- [ ] README matches supported stacks and try commands
- [ ] Draft PR updated; merge when satisfied

---

## Origin of this document

Rewrote from the living overnight Autopilot plan that steered unattended
15-minute ticks on this branch (2026-08-02). Loop mechanics, concurrency
rules, and self-renewing backlog protocol were removed on purpose so this
file is stable merge context — not an infinite builder.
