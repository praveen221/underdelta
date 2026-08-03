# Underdelta — Walkable graph (v0.1 context)

Historical context for the **3-tier progressive disclosure** work shipped on
branch `walkable-graph-02082026` (2026-08-02). Use this file to understand what
changed after v0, how to demo it, and what not to reinvent.

**Branch:** `walkable-graph-02082026`  
**Completed:** 2026-08-02 (`LOOP COMPLETE`)  
**Prior foundation:** [`docs/V0_BUILD_CONTEXT.md`](V0_BUILD_CONTEXT.md)  
**Loop archaeology (kept):** [`docs/loopplans/WALKABLE_GRAPH_02082026.md`](loopplans/WALKABLE_GRAPH_02082026.md)

---

## What shipped

The browser is now a **place you walk**, not a dump of every node and edge.

| Tier | Control | What you see |
|------|---------|----------------|
| **Beginner** (default) | `View: Beginner` / Overview | Product Flow + top systems. Calm cold open. |
| **Intermediate** | Focus a system (double-click / Find→Enter) | That system’s neighborhood — hubs, routes, story edges — not every function. |
| **Advanced** | `View: Advanced` **and** a focus | Code inside the current cluster (modules first; functions after drilling into a module). Never a whole-repo function phonebook. |

Also shipped:

- **Navigation:** `Overview › …` breadcrumb, Back, Esc (backs one focus step; clears search first when typing)
- **Find → cluster:** search Enter/click jumps into a sensible cluster root (not a god-graph of query hits)
- **Session walk:** `sessionStorage` restores tier/focus per project root for the tab
- **Calmer Intermediate edges:** ownership `contains` fans not painted; structural hairlines quieted
- **README:** “How to read the map”
- **Verify:** golden floors for tiers, focus, Advanced scoping, nav, search-enter, persistence

---

## How to demo (vibe-coder friendly)

```bash
cd /path/to/their/project
curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash
```

(Or after this PR merges to `master`, same command. Until merge, scan from this
branch / a local `./scripts/run.sh /path/to/their/project`.)

**Script for the room:**

1. **Beginner** — “Here’s what you built” (Product Flow left→right). Don’t touch Advanced yet.  
2. Double-click a system they care about (API, UI, Data). **Intermediate** neighborhood.  
3. Cycle to **Advanced** only after focus — modules, then drill for functions.  
4. **Find** a symbol → Enter → lands in a cluster, not spaghetti.  
5. **Esc / Back / Overview** — always a way home.

Success = they grin at step 1–2. Advanced is optional depth, not the pitch.

---

## Loop method (why it stopped cleanly)

This work was driven by a **push-triggered agent loop** steered by
`docs/loopplans/WALKABLE_GRAPH_02082026.md`:

1. Each tick: sync → one Next focus increment → build/verify → update plan → push  
2. Push wakes the next tick (Cursor automation)  
3. When **acceptance gates** all passed, plan set `Loop status: LOOP COMPLETE`  
4. Idle ticks **must not push** → push-trigger starves → loop ends without human babysitting  

That soft-stop is intentional. Hard stop = disable the automation in Cursor.

---

## Out of scope (still future)

Not done in this slice — do not assume they exist:

- Agent query API / MCP (“who owns billing?”, file packs for focus)
- Deeper React/Redux/etc. extraction
- New languages / capability ladder rungs
- Greplica-style session memory
- Graph-edit → infra suggestions

---

## Bug fixes (2026-08-03)

Shipped on `walkable-graph-bugs-03082026` (continues after PR #5):

- **Dead-end Intermediate drills** — leaf services with no Intermediate children escalate to the parent system at Advanced (sibling modules appear; selection kept).
- **View without focus** — no longer cycles Intermediate/Advanced on the calm overview; stays Beginner and nudges a double-click.
- **Inspector on walk** — `focusNode` / breadcrumb navigation call `selectNode` so the right panel shows the clicked thing (not stale Beginner copy).
- **Advanced layout** — Code lane sits beside Systems so modules are next to the stack roster, not a far-right column.
- **Thin Product Flow rooms** — CLI / Viewer-style boxes with little Intermediate furniture open Advanced when they own code; Extractors stays Intermediate (rich service roster).
- **Verify floors** — typescript service → Extractors Advanced; Extractors Intermediate; CLI Advanced (`src/cli.ts`); module stays in-place Advanced.

---
