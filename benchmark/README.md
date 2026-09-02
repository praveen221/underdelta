# Benchmarks

Pinned real repos live in gitignored `.underdelta-real/` (see `docs/V0_BUILD_CONTEXT.md`).

## Phase 2 — Underdelta vs Graphify vs grep

```bash
npm run build
# clones + scans are one-time per machine
node dist/cli.js scan .underdelta-real/node-express-realworld
# Graphify: pip install graphifyy
graphify update .underdelta-real/node-express-realworld --force --no-cluster
node benchmark/phase2-run.mjs
```

Report: [`docs/benchmarks/PHASE2_GRAPHIFY.md`](../docs/benchmarks/PHASE2_GRAPHIFY.md)

Gold questions: `benchmark/gold.mjs`
