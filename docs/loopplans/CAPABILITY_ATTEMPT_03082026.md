# Capability Attempt — 2026-08-03

**Branch:** `capability-attempt-03082026`  
**Goal:** Deterministic product capabilities + detection surfaces (not entity dump).

## Contract (v1)

1. Extractors remain entity detectors.
2. Projection invents **capability** nodes for each Underdelta language/infra extractor.
3. Each capability owns a fixed **detection surface** catalog (`src/capabilitySurfaces.ts`).
4. Drill path: Extractors → capability (e.g. kubernetes) → Detects lane (Deployment / Service / Ingress…).
5. No AI naming in v1. Same SHA → same surfaces. Verify locks the catalog.

## Done when

- [x] `capability` node kind in schema
- [x] Deterministic surface catalog
- [x] Self-map Extractors roster is capabilities
- [x] Focus capability → Intermediate shows Detects surfaces
- [x] Verify floors for typescript + kubernetes surfaces
- [ ] (next) Frontend omission rules for leaf components
- [ ] (next) Foreign-repo capability clustering by route/schema boundaries

## Try

```bash
git checkout capability-attempt-03082026
./scripts/run.sh
# Beginner → Extractors → kubernetes → see Detects: Deployment / Service / Ingress
```
