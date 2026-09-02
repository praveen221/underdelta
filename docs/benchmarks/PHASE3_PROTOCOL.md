# Phase 3 protocol — agent-in-the-loop, written before results

Decides continue / stop for the agent thesis. Frozen before any run.

## Repo

`dubinc/dub` @ `0d8c84e` (Next.js App Router + Prisma monorepo, 140+ `route.ts`
handlers, 450+ files with Prisma writes). Chosen because route → handler →
service → Prisma is multi-hop and split across packages, unlike RealWorld.

## Arms

Same model, same harness (Cursor cloud subagent), same task prompt, same
repo checkout. Fresh context per session.

- **Arm A** — grep / file reads / Graphify (`graphify query|explain|affected|path`
  against a prebuilt `graphify-out/graph.json`). Underdelta forbidden.
- **Arm B** — everything in A **plus** the Underdelta skill and
  `query writes | impact | unknown` against a prebuilt `.underdelta/architecture.json`.

3 sessions per arm. Each session answers all 10 tasks and returns JSON.

## Tasks

- T1–T6: "If `<file>` changes, list every HTTP endpoint (METHOD /path) and every
  Prisma model that may be affected." Files are services/libraries, not route files.
- T7–T8: "Which HTTP endpoints write Prisma model `<Model>`?"
- T9–T10: traps. Questions whose gold answer includes an explicit "not derivable
  from typed facts / unknown" or where Underdelta is expected to give no advantage.

Gold is source-audited by reading `route.ts` files and following imports.
Underdelta output is **not** used to build gold.

## Metrics

- Gold recall per task (endpoints + models).
- **Invented claims**: endpoints or models asserted that are not in gold.
- Tool calls and files read (self-reported by the agent, plus harness wall time).
- Explicit "unknown" on traps.

## Kill rule (decided before running)

Arm B must, averaged over 3 sessions:

1. Produce **≥50% fewer invented claims** than Arm A (and at least 3 fewer absolute), **and**
2. Have **equal or higher mean recall** than Arm A.

If either fails, the agent thesis is not supported on this codebase class and
the recommendation is **stop building adapters; publish and pivot or halt**.

If both pass, the recommendation is **continue as a typed-facts layer**
(option 1 in the 2026-09-02 assessment), not as a graph or viewer company.
