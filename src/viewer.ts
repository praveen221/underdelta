import type { ArchitectureGraph, ImpactReport } from "./schema.js";
import { analyzeArchitecture } from "./analysis.js";

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderArchitectureHtml(
  graph: ArchitectureGraph,
  options: { impact?: ImpactReport } = {},
): string {
  const title = graph.project.name.replaceAll(/[<>&"]/g, "");
  const analysis = analyzeArchitecture(graph);
  const impact = options.impact;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Underdelta</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d0f12;
      --panel: #15181d;
      --panel-2: #1b1f25;
      --line: #2a3038;
      --muted: #89919d;
      --text: #eef1f5;
      --accent: #7c9cff;
      --observed: #57c785;
      --derived: #e2ad53;
      --inferred: #c17bea;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: var(--bg); color: var(--text); font: 13px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
    button, input { font: inherit; color: inherit; }
    button { background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px; padding: 7px 10px; cursor: pointer; }
    button:hover { border-color: #596371; }
    #shell { display: grid; grid-template-rows: 52px 1fr; height: 100%; }
    header { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--line); padding: 0 14px; background: var(--panel); }
    header strong { font-size: 15px; }
    header .meta { color: var(--muted); }
    #focus-crumb { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; max-width: min(420px, 36vw); color: var(--muted); }
    #focus-crumb[hidden] { display: none; }
    #focus-crumb .crumb { background: transparent; border: none; padding: 2px 4px; color: var(--accent); border-radius: 4px; }
    #focus-crumb .crumb:hover { border-color: transparent; background: color-mix(in srgb, var(--accent) 12%, transparent); }
    #focus-crumb .crumb.current { color: var(--text); cursor: default; font-weight: 650; }
    #focus-crumb .crumb.current:hover { background: transparent; }
    #analysis-button[data-status="partial"] { border-color: var(--derived); }
    #analysis-button[data-status="empty"] { color: var(--muted); }
    #analysis-button[aria-pressed="true"] { border-color: var(--accent); background: #1c2230; }
    #focus-crumb .crumb-sep { color: var(--muted); user-select: none; }
    #search-wrap { position: relative; margin-left: auto; width: min(340px, 30vw); }
    #search { width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 8px 10px; outline: none; }
    #search:focus { border-color: var(--accent); }
    #search-results {
      position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
      max-height: min(320px, 50vh); overflow: auto; margin: 0; padding: 4px;
      list-style: none; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, .35);
    }
    #search-results[hidden] { display: none; }
    #search-results button {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      width: 100%; text-align: left; background: transparent; border: 1px solid transparent;
      border-radius: 6px; padding: 7px 8px; cursor: pointer;
    }
    #search-results button:hover, #search-results button[data-active="true"] {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    #search-results .match-label { font-weight: 650; }
    #search-results .match-meta { color: var(--muted); font-size: 11px; }
    #search-results .match-hint { color: var(--accent); font-size: 10px; margin-top: 2px; }
    #workspace { display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
    #viewport { position: relative; overflow: hidden; cursor: grab; }
    #viewport.dragging { cursor: grabbing; }
    #world { position: absolute; transform-origin: 0 0; width: 1px; height: 1px; }
    #edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
    .edge { stroke: #46505d; stroke-width: 1.2; fill: none; opacity: .48; }
    .edge.derived { stroke-dasharray: 5 4; stroke: var(--derived); }
    .edge.inferred { stroke-dasharray: 2 5; stroke: var(--inferred); }
    /* Ownership/import fans — collapsed off-canvas at Intermediate; quiet when shown */
    .edge.structural { stroke: #3d4652; stroke-width: 1; opacity: .26; stroke-dasharray: 3 5; }
    .edge.structural.derived { stroke: #5c5644; opacity: .3; stroke-dasharray: 3 5; }
    .edge.structural.inferred { stroke: #4a4558; opacity: .28; stroke-dasharray: 2 5; }
    .edge.structural.active { stroke: var(--accent); stroke-width: 2; opacity: .9; stroke-dasharray: none; }
    /* Product collaboration (uses/renders/…) — distinct from import/call hairlines */
    .edge.collab { stroke: #6e8fe0; stroke-width: 1.55; opacity: .64; }
    .edge.collab.derived { stroke-dasharray: 8 5; stroke: #6e8fe0; }
    .edge.collab.inferred { stroke-dasharray: 3 4; stroke: #6e8fe0; }
    .edge.collab.flows-to { stroke: #8aa6f0; stroke-width: 1.75; opacity: .72; }
    /* Messaging + migration story edges — labeled on the canvas */
    .edge.narrative { stroke-width: 1.75; opacity: .82; stroke-dasharray: none; }
    .edge.narrative.derived, .edge.narrative.inferred { stroke-dasharray: none; }
    .edge.narrative.publishes { stroke: #d17f54; }
    .edge.narrative.consumes { stroke: #c48a5a; }
    .edge.narrative.migrates { stroke: #52a976; }
    .edge.narrative.publishes.consumes { stroke: #d09a45; }
    .edge.narrative.active { stroke: var(--accent); stroke-width: 2.4; opacity: .96; }
    /* Table↔table data story — always-on labels (favorites / follows / …) */
    .edge.relation { stroke: #52a976; stroke-width: 1.7; opacity: .78; stroke-dasharray: none; }
    .edge.relation.derived, .edge.relation.inferred { stroke-dasharray: none; stroke: #52a976; }
    .edge.relation.active { stroke: var(--accent); stroke-width: 2.4; opacity: .96; }
    .edge.active { stroke: var(--accent); stroke-width: 2.3; opacity: .95; }
    .edge.collab.active { stroke: var(--accent); stroke-width: 2.45; opacity: .96; }
    .edge-badge-bg { fill: var(--panel); stroke: var(--line); stroke-width: 1; }
    .edge-badge { fill: var(--text); font: 650 10px/1 Inter, ui-sans-serif, system-ui, sans-serif; }
    .edge-badge-group.relation .edge-badge-bg { stroke: color-mix(in srgb, #52a976 55%, var(--line)); }
    .edge-badge-group.operation .edge-badge-bg { stroke: color-mix(in srgb, #6e8fe0 55%, var(--line)); }
    #nodes { position: absolute; inset: 0; }
    .lane-label { position: absolute; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
    .node { --kind-color: #77808d; position: absolute; width: 190px; min-height: 58px; background: var(--panel); border: 1px solid var(--kind-color); border-radius: 9px; padding: 9px 10px; cursor: grab; touch-action: none; user-select: none; transition: opacity .12s, border-color .12s, background .12s; }
    .node.impact-hit {
      border-color: #f0b429;
      box-shadow: 0 0 0 1px color-mix(in srgb, #f0b429 55%, transparent), 0 0 18px color-mix(in srgb, #f0b429 22%, transparent);
    }
    .node.impact-changed {
      border-color: #ff7b72;
      box-shadow: 0 0 0 1px color-mix(in srgb, #ff7b72 50%, transparent);
    }
    #impact-banner {
      display: none; align-items: center; gap: 10px; flex-wrap: wrap;
      border-bottom: 1px solid var(--line); padding: 8px 14px; background: #1a1710; color: #f5e6c8; font-size: 12px;
    }
    #impact-banner[data-active="true"] { display: flex; }
    #impact-banner strong { color: #f0b429; }
    .node.dragging { cursor: grabbing; z-index: 4; box-shadow: 0 12px 30px rgba(0, 0, 0, .38); }
    .node:hover, .node.selected { border-color: var(--accent); background: #1c2230; }
    .node.dim { opacity: .16; }
    .node .top { display: flex; align-items: center; gap: 8px; }
    .node .glyph { display: grid; place-items: center; width: 26px; height: 26px; flex: 0 0 26px; color: var(--kind-color); }
    .node .glyph svg { width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .node .glyph .function-mark { font: 700 20px/1 Georgia, serif; }
    .node .label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 650; }
    .node .kind { color: var(--muted); font-size: 11px; margin: 5px 0 0 34px; text-transform: capitalize; }
    .node[data-kind="module"] { --kind-color: #77808d; border-radius: 4px 10px 10px; }
    .node[data-kind="module"]::before { content: ""; position: absolute; width: 48px; height: 5px; left: -1px; top: -6px; border: 1px solid var(--kind-color); border-bottom: 0; border-radius: 5px 6px 0 0; background: var(--panel); }
    .node[data-kind="system"] { --kind-color: #7c9cff; min-height: 72px; width: 210px; border-width: 2px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kind-color) 25%, transparent); }
    /* Kind clusters are a view, not a product system — dashed so they don't fake a hub. */
    .node[data-kind-cluster="true"] { --kind-color: #4d8ed5; border-style: dashed; box-shadow: none; }
    .node[data-kind="service"] { --kind-color: #8b7cf6; min-height: 68px; outline: 1px solid color-mix(in srgb, var(--kind-color) 35%, transparent); outline-offset: 3px; }
    .node[data-kind="component"], .node[data-kind="page"], .node[data-kind="ui"] { --kind-color: #63a8e8; border-radius: 5px 5px 14px 14px; border-top-width: 5px; }
    .node[data-kind="hook"] { --kind-color: #5dbfc1; width: 176px; min-height: 48px; border-style: dashed; border-radius: 999px; }
    .node[data-kind="hook"] .kind { margin-top: 2px; }
    .node[data-kind="function"] { --kind-color: #9a81c8; width: 170px; min-height: 46px; border-radius: 999px; }
    .node[data-kind="function"] .kind { margin-top: 1px; }
    .node[data-kind="route"], .node[data-kind="api"] { --kind-color: #4d8ed5; border-left-width: 5px; border-radius: 4px 10px 10px 4px; }
    .node[data-kind="database"] { --kind-color: #52a976; border-radius: 28px 28px 10px 10px; border-top-width: 3px; }
    .node[data-kind="table"], .node[data-kind="collection"] { --kind-color: #52a976; border-radius: 3px; background-image: repeating-linear-gradient(0deg, transparent 0 16px, color-mix(in srgb, var(--kind-color) 12%, transparent) 16px 17px); }
    .node[data-kind="column"] { --kind-color: #6d987d; width: 168px; min-height: 42px; border-radius: 3px; }
    .node[data-kind="cron"], .node[data-kind="job"] { --kind-color: #d09a45; border-radius: 30px 9px 9px 30px; }
    .node[data-kind="queue"], .node[data-kind="topic"] { --kind-color: #d17f54; border-style: double; border-width: 3px; border-radius: 4px; }
    .node[data-kind="pipeline"], .node[data-kind="pipeline-step"] { --kind-color: #d09a45; clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 12px 50%); padding-left: 20px; }
    .node[data-kind="external"] { --kind-color: #b16fc5; border-style: dotted; border-width: 2px; }
    .node[data-kind="config"] { --kind-color: #9099a6; border-radius: 2px; }
    .node[data-role="artifact"] { --kind-color: #c4a35a; border-style: dashed; border-width: 2px; }
    aside { min-width: 0; border-left: 1px solid var(--line); background: var(--panel); overflow: auto; padding: 16px; }
    #inspector-close { display: none; }
    aside h2 { margin: 0 0 4px; font-size: 17px; }
    aside h3 { margin: 20px 0 8px; color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    aside p { color: var(--muted); margin: 4px 0 12px; overflow-wrap: anywhere; }
    .pill { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; margin: 2px 4px 2px 0; font-size: 11px; color: var(--muted); }
    .inspector-role { color: var(--text); margin: 4px 0 14px; font-size: 13px; line-height: 1.4; }
    .inspector-more { margin-top: 8px; opacity: .85; }
    .analysis-status { color: var(--text); margin: 4px 0 14px; }
    .analysis-status.partial { color: var(--derived); }
    .analysis-status.empty { color: var(--muted); }
    .analysis-issue { border-left: 3px solid var(--derived); padding: 2px 0 2px 9px; margin: 8px 0 12px; }
    .analysis-issue[data-severity="error"] { border-color: #e06c75; }
    .analysis-issue strong { display: block; font-size: 12px; }
    .analysis-issue .source { color: var(--muted); font-size: 11px; margin-top: 4px; }
    .collab-edge { margin: 0 0 10px; }
    .collab-edge .pill { margin-bottom: 2px; }
    .collab-detail { margin: 2px 0 0; font-size: 12px; line-height: 1.35; color: var(--text); }
    .table-relation { margin: 0 0 10px; }
    .table-relation .pill { margin-bottom: 2px; }
    .relation-detail { margin: 2px 0 0; font-size: 12px; line-height: 1.35; color: var(--text); }
    .messaging-role { margin: 0 0 10px; }
    .messaging-role-label { margin: 0 0 4px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
    .messaging-hub-note { margin: 0 0 10px; font-size: 12px; color: var(--text); }
    .evidence { border-top: 1px solid var(--line); padding: 9px 0; }
    .evidence a { color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
    .evidence a:hover { color: var(--accent); }
    .certainty { font-size: 10px; text-transform: uppercase; margin-top: 3px; }
    .certainty.observed { color: var(--observed); }
    .certainty.derived { color: var(--derived); }
    .certainty.inferred { color: var(--inferred); }
    .empty { color: var(--muted); padding-top: 30px; text-align: center; }
    #canvas-chrome { position: absolute; left: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 6px; max-width: min(540px, calc(100% - 28px)); pointer-events: none; }
    #canvas-tools { position: absolute; z-index: 8; top: 14px; right: 14px; display: flex; flex-direction: column; gap: 6px; }
    #canvas-tools button { min-width: 52px; height: 34px; padding: 0 9px; background: color-mix(in srgb, var(--panel) 92%, transparent); }
    #walk-hint { color: var(--muted); background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; font-size: 12px; line-height: 1.35; }
    #legend { display: flex; flex-wrap: wrap; gap: 10px; color: var(--muted); background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
    #legend span::before { content: ""; display: inline-block; width: 14px; border-top: 2px solid var(--observed); margin-right: 5px; vertical-align: middle; }
    #legend .derived::before { border-color: var(--derived); border-top-style: dashed; }
    #legend .inferred::before { border-color: var(--inferred); border-top-style: dotted; }
    #legend .collab::before { border-color: #6e8fe0; border-top-width: 2.5px; }
    #legend .narrative::before { border-color: #d17f54; border-top-width: 2.5px; }
    #legend .relation::before { border-color: #52a976; border-top-width: 2.5px; }
    @media (max-width: 760px) {
      #shell { grid-template-rows: auto 1fr; }
      header { flex-wrap: wrap; padding: 8px; gap: 6px; }
      header strong { flex: 1 1 90px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      #search-wrap { order: 10; width: 100%; margin-left: 0; }
      #workspace { grid-template-columns: 1fr; }
      #workspace { position: relative; overflow: hidden; }
      #inspector-panel {
        display: block; position: absolute; z-index: 30; inset: 0; padding: 10px 16px 16px;
        border-left: 0; transform: translateX(100%); transition: transform .16s ease;
      }
      #shell.inspector-open #inspector-panel { transform: translateX(0); }
      #inspector-close { display: block; margin: 0 0 12px auto; }
      header .meta { display: none; }
    }
  </style>
</head>
<body>
  <div id="shell">
    <header>
      <strong>${title}</strong>
      <span class="meta" id="counts"></span>
      <button id="back" hidden title="Back one step (Esc) — Intermediate, then Beginner">Back</button>
      <button id="overview" title="Return to Beginner overview">Overview</button>
      <button id="tier" title="Beginner: product story · Intermediate: enter a system’s neighborhood · Advanced: code in focus (modules; functions inside a module/api)">View: Beginner</button>
      <button id="analysis-button" type="button" title="Show detected capabilities and scan diagnostics">Analysis</button>
      <nav class="meta" id="focus-crumb" hidden aria-label="Focus path"></nav>
      <div id="search-wrap">
        <input id="search" type="search" placeholder="Find… Enter enters its cluster" autocomplete="off" />
        <ul id="search-results" hidden role="listbox" aria-label="Search matches"></ul>
      </div>
    </header>
    <div id="impact-banner" data-active="${impact ? "true" : "false"}" ${impact ? "" : "hidden"}>
      ${
        impact
          ? `<strong>Change impact</strong>
      <span>${impact.changed.files.length} file(s) · ${impact.changed.symbols.length} symbol(s)${
              (impact.changed.deletedFiles?.length ?? 0) > 0
                ? ` · ${impact.changed.deletedFiles.length} deleted (base graph needed for deleted symbols)`
                : ""
            }</span>
      <span>${impact.impact.endpoints.length} endpoint(s) · ${impact.impact.resources.length} resource(s) · ${impact.impact.jobs.length} job(s)</span>
      <span class="meta">resolved calls ${impact.metrics.callsResolved} · unresolved ${impact.metrics.callsUnresolved}</span>`
          : ""
      }
    </div>
    <div id="workspace">
      <main id="viewport">
        <div id="world">
          <svg id="edges"></svg>
          <div id="nodes"></div>
        </div>
        <div id="canvas-tools" aria-label="Graph view controls">
          <button id="zoom-out" type="button" title="Zoom out" aria-label="Zoom out">-</button>
          <button id="zoom-in" type="button" title="Zoom in" aria-label="Zoom in">+</button>
          <button id="fit-view" type="button" title="Fit visible graph" aria-label="Fit visible graph">Fit</button>
          <button id="reset-layout" type="button" title="Reset all moved nodes" aria-label="Reset all moved nodes">Reset</button>
        </div>
        <div id="canvas-chrome">
          <div id="walk-hint">Beginner · Product Flow — select to inspect, double-click to walk in</div>
          <div id="legend"><span>observed</span><span class="derived">derived</span><span class="inferred">inferred</span><span class="collab">operations</span><span class="narrative">publishes / migrates</span><span class="relation">table relations</span></div>
        </div>
      </main>
      <aside id="inspector-panel">
        <button id="inspector-close" type="button" aria-label="Close inspector">Close</button>
        <div id="inspector"><div class="empty">Product Flow · Beginner. Select a system to inspect evidence, or double-click to walk into its Intermediate neighborhood.</div></div>
      </aside>
    </div>
  </div>
  <script>
    const graph = ${safeJson(graph)};
    const analysis = ${safeJson(analysis)};
    const impact = ${safeJson(impact ?? null)};
    const impactHighlight = new Set(
      impact && Array.isArray(impact.highlightNodeIds) ? impact.highlightNodeIds : [],
    );
    const impactChanged = new Set(
      impact && impact.changed && Array.isArray(impact.changed.symbols)
        ? impact.changed.symbols.map((symbol) => symbol.id)
        : [],
    );
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoing = new Map();
    const incoming = new Map();
    for (const edge of graph.edges) {
      if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
      if (!incoming.has(edge.target)) incoming.set(edge.target, []);
      outgoing.get(edge.source).push(edge);
      incoming.get(edge.target).push(edge);
    }

    const lanes = [
      { name: "Systems", kinds: ["system", "api", "service", "pipeline", "capability"] },
      // Capability drill: deterministic "what this detects" surfaces (not entity dump).
      { name: "Detects", kinds: [] },
      { name: "Experience", kinds: ["ui", "page", "component", "hook"] },
      { name: "Application", kinds: ["route"] },
      { name: "Data & automation", kinds: ["database", "schema", "table", "collection", "cron", "job", "queue", "topic", "pipeline", "pipeline-step"] },
      { name: "External", kinds: ["external", "config", "unknown"] },
      // Advanced-in-focus lane (modules/functions) — not a whole-repo dump.
      { name: "Code", kinds: ["module", "function", "column", "pipeline-step"] }
    ];
    // Mongo aggregate hubs live under Data beside collections; semantic
    // Pipelines / Compile pipeline systems stay in the Systems lane.
    function isMongoAggregateHub(node) {
      return (
        node.kind === "pipeline" &&
        node.metadata &&
        node.metadata.mongoAggregate
      );
    }
    function isDetectionSurface(node) {
      return !!(
        node.metadata &&
        (node.metadata.role === "detection-surface" || node.metadata.detectionSurface)
      );
    }
    // Pass B FE shell hubs (Public / Auth / Protected) — Intermediate is tools
    // (nested route molecules) plus their API story neighbors — not code flood.
    function isShellHub(node) {
      return !!(node && node.metadata && node.metadata.shellHub === true);
    }
    function isRouteMoleculeHub(node) {
      return !!(node && node.metadata && node.metadata.routeMolecule === true);
    }
    function isHttpApiStoryHub(node) {
      return !!(
        node &&
        (node.kind === "api" ||
          (node.metadata && node.metadata.systemKey === "api"))
      );
    }
    // Shell Intermediate: nested tools under the shell, plus HTTP API when a
    // tool has data-story edges to it. Still hide feature roots / leaf chrome.
    function shellToolStoryVisible(node, focusId) {
      const focused = focusId ? byId.get(focusId) : null;
      if (!isShellHub(focused)) return true;
      if (node.id === focusId) return true;
      if (isRouteMoleculeHub(node) && node.parentId === focusId) return true;
      if (isHttpApiStoryHub(node)) return true;
      return false;
    }
    // Tool Intermediate: focusing a route molecule shows the tool, its page-owned
    // feature roots, and HTTP API story neighbors — not page-atom / Card flood.
    function routeToolStoryVisible(node, focusId) {
      const focused = focusId ? byId.get(focusId) : null;
      if (!isRouteMoleculeHub(focused)) return true;
      if (node.id === focusId) return true;
      if (isHttpApiStoryHub(node)) return true;
      if (
        node.metadata &&
        node.metadata.featureRoot === true &&
        node.parentId === focusId
      ) {
        return true;
      }
      return false;
    }
    // Back-compat name kept for verify string floors / older notes.
    function shellRoutesOnlyVisible(node, focusId) {
      return (
        shellToolStoryVisible(node, focusId) &&
        routeToolStoryVisible(node, focusId)
      );
    }
    // Route atoms nested under domain groups (Users / Articles) — only show when
    // that group is focused (same Intermediate calm as detection surfaces).
    function isRouteGroupMember(node) {
      return !!(
        node.kind === "route" &&
        node.metadata &&
        (node.metadata.routeGroupMember === true || node.metadata.routeGroup)
      );
    }
    function routeGroupMemberVisible(node, focusId) {
      if (!isRouteGroupMember(node)) return true;
      if (!focusId) return false;
      return node.parentId === focusId || node.id === focusId;
    }
    function isKindClusterHub(node) {
      return !!(node && node.metadata && node.metadata.kindCluster === true);
    }
    function isKindClusterMember(node) {
      return !!(node && node.metadata && node.metadata.kindClusterMember === true);
    }
    function isNestedRouteGroupHub(node) {
      return !!(
        node &&
        node.metadata &&
        node.metadata.routeGroup === true &&
        node.metadata.routeGroupNested === true
      );
    }
    // Kind-cluster hubs, nested route groups (Comments under Articles), and
    // their members stay off Beginner / ancestor Intermediate until focused.
    function clusterMemberVisible(node, focusId) {
      if (
        isKindClusterHub(node) ||
        isKindClusterMember(node) ||
        isNestedRouteGroupHub(node)
      ) {
        if (!focusId) return false;
        return node.parentId === focusId || node.id === focusId;
      }
      return routeGroupMemberVisible(node, focusId);
    }
    function hasRouteGroupChild(focusId) {
      if (!focusId) return false;
      return graph.nodes.some((node) =>
        !!(node.parentId === focusId && node.metadata && node.metadata.routeGroup === true),
      );
    }
    function storyTouches(edge, leftId, rightId) {
      if (!neighborhoodEdgeKinds.has(edge.kind)) return false;
      return (
        (edge.source === leftId && edge.target === rightId) ||
        (edge.source === rightId && edge.target === leftId)
      );
    }
    function visibleRouteStoriesTo(focusId, resourceId) {
      const allowed = focusNeighborhood(focusId);
      for (const node of graph.nodes) {
        if (node.kind !== "route") continue;
        if (!allowed.has(node.id)) continue;
        if (!clusterMemberVisible(node, focusId)) continue;
        const edges = [...(outgoing.get(node.id) || []), ...(incoming.get(node.id) || [])];
        for (const edge of edges) {
          if (storyTouches(edge, node.id, resourceId)) return true;
        }
      }
      return false;
    }
    // API hallway: Article/User/Comment live in Articles/Users rooms.
    // Keep ungrouped leftovers (GET /tags → Tag). Intermediate only.
    function isHallwayTable(node, focusId) {
      if (!focusId) return false;
      if (node.kind !== "table" && node.kind !== "collection") return false;
      if (node.id === focusId) return false;
      if (!hasRouteGroupChild(focusId)) return false;
      if (visibleRouteStoriesTo(focusId, node.id)) return false;
      return true;
    }
    // SQL migration files are lineage, not Data Intermediate furniture.
    // Advanced-in-focus can still open them. Tables keep migrates evidence.
    function isMigrationSchemaLeaf(node) {
      return !!(
        node.kind === "schema" &&
        node.metadata &&
        (node.metadata.role === "migration" ||
          node.metadata.intermediateOmitReason === "migration-lineage")
      );
    }
    // Data Intermediate is tables + the database hub. HTTP API / leftover
    // routes (GET /tags) belong in the API hallway. Table focus still shows
    // who writes the row.
    function isDataRoomApiLeftover(node, focusId) {
      if (!focusId) return false;
      const focused = byId.get(focusId);
      if (!isDataAccessSystem(focused)) return false;
      if (node.id === focusId) return false;
      if (isHttpApiStoryHub(node)) return true;
      if (node.kind === "route") return true;
      return !!(node.metadata && node.metadata.routeGroup === true);
    }
    function laneNameFor(node) {
      if (isDetectionSurface(node)) return "Detects";
      if (isMongoAggregateHub(node)) return "Data & automation";
      for (const lane of lanes) {
        if (lane.kinds.includes(node.kind)) return lane.name;
      }
      return null;
    }
    // Code-level kinds — Beginner/Intermediate hide these; Advanced shows them
    // only inside the current focus (never a whole-repo dump).
    const advancedKinds = new Set(["function", "column", "module", "pipeline-step"]);
    // Broad Product Flow containers: Advanced reveals modules/columns first;
    // functions wait until the user focuses a code container (module/api/…).
    const broadFocusKinds = new Set(["system", "pipeline"]);
    const functionFocusKinds = new Set([
      "module", "api", "service", "capability", "function", "route",
      "ui", "page", "component", "hook",
    ]);
    // Hub / leaf kinds that belong on Intermediate (and Advanced-in-focus), not
    // Beginner cold open. Beginner stays Product Flow + top systems only.
    const intermediateKinds = new Set([
      "table", "collection", "queue", "cron", "route", "page",
      "component", "hook", "job", "database", "schema",
    ]);
    // Product-story edges — canvas + inspector treat these apart from imports/calls.
    const collaborationKinds = new Set([
      "uses", "renders", "exposes", "triggers", "configures",
      "queries", "reads", "writes", "flows-to",
    ]);
    // Messaging + schema lineage — labeled badges on the default overview.
    const narrativeKinds = new Set(["publishes", "consumes", "migrates"]);
    // Focus neighborhood story edges (not calls / depends-on hairballs).
    const neighborhoodEdgeKinds = new Set([
      ...collaborationKinds,
      ...narrativeKinds,
      "schedules", "handled-by", "routes-to",
    ]);
    // Ownership fans (contains × N children) — never painted; layout is the signal.
    const ownershipEdgeKinds = new Set(["contains"]);
    // Derived/inferred depends-on / calls / imports — yellow spaghetti at Intermediate
    // unless selected (or quiet Advanced-in-focus). Table relations stay separate.
    const structuralHairlineKinds = new Set([
      "depends-on", "calls", "imports", "exports",
    ]);
    // Beginner = product flow · Intermediate = focused neighborhood · Advanced = code in focus
    const tierOrder = ["beginner", "intermediate", "advanced"];
    const MIN_SCALE = .15;
    const MAX_SCALE = 2.4;
    const state = {
      scale: 1,
      x: 36,
      y: 40,
      dragging: false,
      startX: 0,
      startY: 0,
      nodeDrag: null,
      nodeDragFrame: null,
      suppressNodeClick: null,
      suppressCanvasClick: false,
      focus: null,
      selected: null,
      tier: "beginner",
      history: [],
    };
    // Reload comfort: remember last walk (tier + focus stack) for this project root.
    const projectStorageId = graph.project.root || graph.project.name || "default";
    const walkStorageKey = "underdelta:walk:" + projectStorageId;
    const layoutStorageKey = "underdelta:layout:" + projectStorageId;
    let manualLayouts = {};
    function currentLayoutKey() {
      return state.tier + ":" + (state.focus || "overview");
    }
    function restoreManualLayouts() {
      try {
        const saved = JSON.parse(localStorage.getItem(layoutStorageKey) || "{}");
        manualLayouts = saved && typeof saved === "object" ? saved : {};
      } catch (_err) {
        manualLayouts = {};
      }
    }
    function persistManualLayouts() {
      try {
        localStorage.setItem(layoutStorageKey, JSON.stringify(manualLayouts));
      } catch (_err) {
        /* private mode / quota - dragging still works for this render */
      }
    }
    function manualPositionFor(nodeId) {
      const layout = manualLayouts[currentLayoutKey()];
      const position = layout && layout[nodeId];
      return position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? position
        : null;
    }
    function setManualPosition(nodeId, x, y) {
      const key = currentLayoutKey();
      if (!manualLayouts[key]) manualLayouts[key] = {};
      manualLayouts[key][nodeId] = { x, y };
    }
    function clearManualLayouts() {
      manualLayouts = {};
      persistManualLayouts();
    }
    function persistWalkState() {
      try {
        sessionStorage.setItem(walkStorageKey, JSON.stringify({
          tier: state.tier,
          focus: state.focus,
          history: state.history.filter(Boolean),
          selected: state.selected,
        }));
      } catch (_err) {
        /* private mode / quota — walk still works without persistence */
      }
    }
    function restoreWalkState() {
      try {
        const raw = sessionStorage.getItem(walkStorageKey);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== "object") return false;
        const focus = typeof saved.focus === "string" && byId.has(saved.focus) ? saved.focus : null;
        const history = Array.isArray(saved.history)
          ? saved.history.filter((id) => typeof id === "string" && byId.has(id))
          : [];
        state.focus = focus;
        state.history = focus ? history : [];
        const selected = typeof saved.selected === "string" && byId.has(saved.selected)
          ? saved.selected
          : focus;
        state.selected = selected;
        // Without a focus, Intermediate/Advanced are not real modes — stay Beginner.
        if (!focus) {
          state.tier = "beginner";
        } else if (typeof saved.tier === "string" && tierOrder.includes(saved.tier) && saved.tier !== "beginner") {
          state.tier = saved.tier;
        } else if (focus) {
          const focused = byId.get(focus);
          state.tier = focused && advancedKinds.has(focused.kind) ? "advanced" : "intermediate";
        } else {
          state.tier = "beginner";
        }
        return true;
      } catch (_err) {
        return false;
      }
    }
    function isAdvancedTier() {
      return state.tier === "advanced";
    }
    // Advanced code kinds only inside the focused cluster — never whole-repo.
    // Modules/columns/pipeline-steps appear at Advanced+focus; functions appear
    // when the focus is a code container (not a broad system/pipeline hub).
    function showsAdvancedKind(node) {
      if (!isAdvancedTier() || !state.focus) return false;
      if (node.kind !== "function") return true;
      const focused = byId.get(state.focus);
      if (!focused) return false;
      if (broadFocusKinds.has(focused.kind)) return false;
      return functionFocusKinds.has(focused.kind);
    }
    function tierButtonLabel() {
      if (state.tier === "beginner") return "View: Beginner";
      if (state.tier === "intermediate") return "View: Intermediate";
      if (state.focus) return "View: Advanced · code in focus";
      return "View: Advanced";
    }
    function syncTierButton() {
      const button = document.getElementById("tier");
      if (!button) return;
      button.textContent = tierButtonLabel();
      button.dataset.tier = state.tier;
      button.dataset.codeInFocus = state.tier === "advanced" && state.focus ? "true" : "false";
    }
    // Legend + inspector empty copy stay honest to the current walk tier.
    function walkHintText() {
      if (state.tier === "advanced" && state.focus) {
        const label = byId.get(state.focus)?.label || "focus";
        return "Advanced · code in " + label + " — modules first; drill a module for functions";
      }
      if (state.tier === "advanced") {
        return "Advanced · needs a focus — double-click a system (no whole-repo dump)";
      }
      if (state.focus) {
        const label = byId.get(state.focus)?.label || "focus";
        const stack = focusStack();
        const parentId = stack.length >= 2 ? stack[stack.length - 2] : null;
        const parentLabel = parentId
          ? (byId.get(parentId)?.label || "previous")
          : "Beginner";
        return "Intermediate · neighborhood of " + label + " — Back / Esc returns to " + parentLabel;
      }
      if (state.tier === "intermediate") {
        return "Double-click a Product Flow system to walk in — View deepens inside a focus";
      }
      return "Beginner · Product Flow — select to inspect, double-click to walk in";
    }
    function emptyInspectorMessage() {
      if (state.tier === "advanced") {
        if (!state.focus) {
          return "Advanced shows code in focus — double-click a system (then a module/api) to open its cluster. No whole-repo function dump.";
        }
        return "Advanced · code in this focus. Select a module or function here. Back / Esc returns to Intermediate, then Beginner.";
      }
      if (state.focus) {
        return "Intermediate neighborhood — select a neighbor, or double-click a module/api for Advanced code in focus.";
      }
      if (state.tier === "intermediate") {
        return "Double-click a Product Flow system to walk in — View deepens inside a focus.";
      }
      return "Product Flow · Beginner. Select a system to inspect evidence, or double-click to walk into its Intermediate neighborhood.";
    }
    function emptyInspectorHtml() {
      if (state.tier === "beginner" && !state.focus && analysis.status !== "mapped") {
        return analysisPanelHtml();
      }
      return '<div class="empty">' + emptyInspectorMessage() + "</div>";
    }
    function escapeHtml(text) {
      return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }
    function diagnosticHtml(diagnostic) {
      const item = diagnostic.evidence;
      let source = "";
      if (item && item.file) {
        const line = item.range?.startLine || 1;
        const href = "vscode://file/" + graph.project.root.replace(/\\\/$/, "") + "/" + item.file + ":" + line;
        source = '<div class="source"><a href="' + escapeHtml(href) + '">' + escapeHtml(item.file + ":" + line) + "</a></div>";
      }
      return '<div class="analysis-issue" data-severity="' + escapeHtml(diagnostic.severity) + '">' +
        "<strong>" + escapeHtml(diagnostic.message) + "</strong>" + source + "</div>";
    }
    function analysisPanelHtml() {
      const capabilities = analysis.capabilities.length
        ? analysis.capabilities.map((capability) =>
            '<span class="pill">' + escapeHtml(capability.label) + ": " + capability.count + "</span>"
          ).join("")
        : "<p>No supported capabilities mapped.</p>";
      const issues = analysis.issues.length
        ? "<h3>Issues</h3>" + analysis.issues.map(diagnosticHtml).join("")
        : "";
      const unsupported = analysis.unsupported.length
        ? '<p class="inspector-role">Detected technology without an installed adapter.</p>'
        : "";
      const certainty = analysis.certainty;
      return "<h2>Analysis</h2>" +
        '<p class="analysis-status ' + analysis.status + '">' + escapeHtml(analysis.message) + "</p>" +
        unsupported +
        "<h3>Detected</h3>" + capabilities +
        issues +
        "<h3>Evidence</h3>" +
        '<span class="pill">Observed: ' + certainty.observed + "</span>" +
        '<span class="pill">Derived: ' + certainty.derived + "</span>" +
        '<span class="pill">Inferred: ' + certainty.inferred + "</span>" +
        "<h3>Scan</h3>" +
        '<span class="pill">Files: ' + analysis.filesScanned + "</span>" +
        '<span class="pill">Nodes: ' + graph.nodes.length + "</span>" +
        '<span class="pill">Relationships: ' + graph.edges.length + "</span>";
    }
    function syncAnalysisButton(open = false) {
      const button = document.getElementById("analysis-button");
      if (!button) return;
      button.dataset.status = analysis.status;
      button.setAttribute("aria-pressed", open ? "true" : "false");
      button.textContent = analysis.status === "partial"
        ? "Analysis · " + analysis.issues.length
        : analysis.status === "empty"
          ? "Analysis · empty"
          : "Analysis · " + analysis.capabilities.length;
    }
    function showAnalysis() {
      state.selected = null;
      inspector.innerHTML = analysisPanelHtml();
      syncAnalysisButton(true);
      openInspector();
      render();
      persistWalkState();
    }
    const inspectorMedia = window.matchMedia("(max-width: 760px)");
    function inspectorIsOverlay() {
      return inspectorMedia.matches;
    }
    function openInspector() {
      if (inspectorIsOverlay()) document.getElementById("shell").classList.add("inspector-open");
    }
    function closeInspector() {
      document.getElementById("shell").classList.remove("inspector-open");
      syncAnalysisButton(false);
    }
    inspectorMedia.addEventListener("change", () => {
      const shell = document.getElementById("shell");
      if (!inspectorMedia.matches) {
        shell.classList.remove("inspector-open");
        return;
      }
      const analysisOpen = document.getElementById("analysis-button").getAttribute("aria-pressed") === "true";
      if (analysisOpen || state.selected) shell.classList.add("inspector-open");
    });
    // Focus walk stack (nulls filtered — first enter used to push null).
    function focusStack() {
      const stack = state.history.filter(Boolean);
      if (state.focus) stack.push(state.focus);
      return stack;
    }
    // Keep the View: label honest as the user walks Back / Overview / crumbs.
    // Overview → Beginner; system/hub focus → Intermediate; code container → Advanced.
    function syncTierToFocus() {
      if (!state.focus) {
        state.tier = "beginner";
      } else {
        const focused = byId.get(state.focus);
        if (focused && advancedKinds.has(focused.kind)) {
          state.tier = "advanced";
        } else {
          state.tier = "intermediate";
        }
      }
      syncTierButton();
    }
    function resetCamera() {
      state.x = 36;
      state.y = 40;
      state.scale = 1;
    }
    function goOverview() {
      state.focus = null;
      state.history = [];
      state.selected = null;
      syncTierToFocus();
      resetCamera();
      inspector.innerHTML = emptyInspectorHtml();
      closeInspector();
      render();
      fitToView();
      persistWalkState();
    }
    // Breadcrumb / Back / Esc: jump to stack index (-1 = Beginner overview).
    function navigateFocusStack(index) {
      const stack = focusStack();
      if (index < 0) {
        goOverview();
        return;
      }
      if (index >= stack.length) return;
      state.focus = stack[index];
      state.history = stack.slice(0, index);
      syncTierToFocus();
      resetCamera();
      selectNode(state.focus);
      fitToView();
      persistWalkState();
    }
    // One step back: nested Advanced → Intermediate parent, then Beginner.
    function goBack() {
      const focused = state.focus ? byId.get(state.focus) : undefined;
      // View can promote a broad system focus to Advanced without adding a
      // focus-stack entry. Step back to that system's Intermediate room first.
      if (state.tier === "advanced" && state.focus && focused && !advancedKinds.has(focused.kind)) {
        state.tier = "intermediate";
        syncTierButton();
        // Advanced may have a selected code node that Intermediate hides.
        // Return selection and inspector context to the still-visible focus.
        selectNode(state.focus);
        fitToView();
        persistWalkState();
        return true;
      }
      const stack = focusStack();
      if (stack.length === 0) return false;
      navigateFocusStack(stack.length - 2);
      return true;
    }
    // Esc = back one tier without the mouse (search clear first when typing).
    function handleEscapeKey(event) {
      if (event.key !== "Escape") return;
      const searchEl = document.getElementById("search");
      if (searchEl && document.activeElement === searchEl) {
        if (searchEl.value) {
          searchEl.value = "";
          renderSearchResults();
          render();
          event.preventDefault();
          return;
        }
        searchEl.blur();
        renderSearchResults();
        event.preventDefault();
        return;
      }
      if (inspectorIsOverlay() && document.getElementById("shell").classList.contains("inspector-open")) {
        closeInspector();
        event.preventDefault();
        return;
      }
      if (goBack()) {
        event.preventDefault();
        return;
      }
      if (state.selected) {
        state.selected = null;
        inspector.innerHTML = emptyInspectorHtml();
        render();
        event.preventDefault();
      }
    }
    function parentOf(node) {
      if (!node) return null;
      if (node.parentId && byId.has(node.parentId)) return byId.get(node.parentId);
      const owned = (incoming.get(node.id) || []).find((edge) => edge.kind === "contains");
      return owned ? byId.get(owned.source) || null : null;
    }
    // Search jump: enter a walkable cluster, not a whole-repo highlight dump.
    // Functions → module/api; Intermediate leaves → system/api hub; hubs → self.
    function clusterRootFor(id) {
      const node = byId.get(id);
      if (!node || node.kind === "product") return null;
      if (
        node.kind === "system" ||
        node.kind === "pipeline" ||
        node.kind === "api" ||
        node.kind === "service" ||
        node.kind === "capability" ||
        node.kind === "ui" ||
        node.kind === "module"
      ) {
        return node.id;
      }
      // Code leaves: open the code container so Advanced can show them.
      if (advancedKinds.has(node.kind)) {
        let cur = node;
        while (cur) {
          const parent = parentOf(cur);
          if (!parent) break;
          if (functionFocusKinds.has(parent.kind)) return parent.id;
          cur = parent;
        }
      }
      // Routes/tables/jobs/… → containing system / pipeline / api / capability.
      if (intermediateKinds.has(node.kind) || node.kind === "external" || node.kind === "config") {
        let cur = node;
        while (cur) {
          const parent = parentOf(cur);
          if (!parent) break;
          if (
            parent.kind === "system" ||
            parent.kind === "pipeline" ||
            parent.kind === "api" ||
            parent.kind === "service" ||
            parent.kind === "capability" ||
            parent.kind === "ui"
          ) {
            return parent.id;
          }
          cur = parent;
        }
      }
      let cur = node;
      while (cur) {
        if (
          cur.kind === "system" ||
          cur.kind === "pipeline" ||
          cur.kind === "api" ||
          cur.kind === "service" ||
          cur.kind === "capability" ||
          cur.kind === "ui" ||
          cur.kind === "module"
        ) {
          return cur.id;
        }
        cur = parentOf(cur);
      }
      return node.id;
    }
    function searchMatchNodes() {
      const query = search.value.trim().toLowerCase();
      if (!query) return [];
      const scored = [];
      for (const node of graph.nodes) {
        if (node.kind === "product") continue;
        const hay = (node.label + " " + node.kind + " " + (node.qualifiedName || "")).toLowerCase();
        if (!hay.includes(query)) continue;
        const label = String(node.label).toLowerCase();
        let score = 40;
        if (label === query) score = 100;
        else if (label.startsWith(query)) score = 80;
        else if (label.includes(query)) score = 60;
        if (node.kind === "system" || node.kind === "pipeline") score += 3;
        else if (node.kind === "api" || node.kind === "service" || node.kind === "ui") score += 2;
        else if (advancedKinds.has(node.kind)) score -= 1;
        scored.push({ node, score });
      }
      scored.sort((a, b) => b.score - a.score || String(a.node.label).localeCompare(String(b.node.label)));
      return scored.map((item) => item.node).slice(0, 12);
    }
    function enterSearchMatch(matchId) {
      const root = clusterRootFor(matchId);
      if (!root) return false;
      search.value = "";
      renderSearchResults();
      if (state.focus !== root) {
        focusNode(root);
      } else {
        syncTierToFocus();
      }
      selectNode(matchId);
      fitToView();
      return true;
    }
    function renderSearchResults() {
      const list = document.getElementById("search-results");
      if (!list) return;
      const matches = searchMatchNodes();
      if (!matches.length) {
        list.hidden = true;
        list.innerHTML = "";
        return;
      }
      list.hidden = false;
      list.innerHTML = matches.map((node, index) => (
        '<li role="option">' +
          '<button type="button" data-id="' + node.id + '" data-active="' + (index === 0 ? "true" : "false") + '">' +
            '<span class="match-label"></span>' +
            '<span class="match-meta"></span>' +
            '<span class="match-hint"></span>' +
          "</button>" +
        "</li>"
      )).join("");
      list.querySelectorAll("button[data-id]").forEach((button, index) => {
        const node = matches[index];
        const rootId = clusterRootFor(node.id);
        const root = rootId ? byId.get(rootId) : null;
        button.querySelector(".match-label").textContent = node.label;
        button.querySelector(".match-meta").textContent =
          node.kind + (node.technology ? " · " + node.technology : "");
        button.querySelector(".match-hint").textContent = root && root.id !== node.id
          ? "Enter → " + root.label + " cluster"
          : "Enter focuses this cluster";
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          enterSearchMatch(node.id);
        };
      });
    }
    function handleSearchKeydown(event) {
      if (event.key !== "Enter") return;
      const matches = searchMatchNodes();
      if (!matches.length) return;
      event.preventDefault();
      enterSearchMatch(matches[0].id);
    }
    const viewport = document.getElementById("viewport");
    const world = document.getElementById("world");
    const nodesLayer = document.getElementById("nodes");
    const edgesLayer = document.getElementById("edges");
    const inspector = document.getElementById("inspector");
    const search = document.getElementById("search");
    const canvasChrome = document.getElementById("canvas-chrome");
    const canvasTools = document.getElementById("canvas-tools");

    function applyTransform() {
      world.style.transform = "translate(" + state.x + "px," + state.y + "px) scale(" + state.scale + ")";
    }

    function contentBounds() {
      if (!positionsScratch.size) return null;
      let minX = 0;
      let minY = 0;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const position of positionsScratch.values()) {
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
        maxX = Math.max(maxX, position.x + position.width);
        maxY = Math.max(maxY, position.y + position.height);
      }
      return { minX, minY, maxX, maxY };
    }

    function fitToView() {
      const bounds = contentBounds();
      if (!bounds) return;
      const rect = viewport.getBoundingClientRect();
      const padding = 28;
      const reservedBottom = (canvasChrome ? canvasChrome.offsetHeight : 0) + 28;
      const reservedRight = (canvasTools ? canvasTools.offsetWidth : 0) + 28;
      const availableWidth = Math.max(120, rect.width - reservedRight - padding * 2);
      const availableHeight = Math.max(120, rect.height - reservedBottom - padding * 2);
      const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
      const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
      state.scale = Math.min(1, Math.min(
        availableWidth / contentWidth,
        availableHeight / contentHeight,
      ));
      state.x = padding - bounds.minX * state.scale;
      state.y = padding - bounds.minY * state.scale;
      applyTransform();
    }

    function zoomBy(factor) {
      const rect = viewport.getBoundingClientRect();
      const mx = rect.width / 2;
      const my = rect.height / 2;
      const next = Math.min(
        MAX_SCALE,
        Math.max(Math.min(MIN_SCALE, state.scale), state.scale * factor),
      );
      state.x = mx - ((mx - state.x) / state.scale) * next;
      state.y = my - ((my - state.y) / state.scale) * next;
      state.scale = next;
      applyTransform();
    }

    function descendants(rootId) {
      const found = new Set([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const id = queue.shift();
        for (const edge of outgoing.get(id) || []) {
          if (edge.kind === "contains" && !found.has(edge.target)) {
            found.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      return found;
    }

    // Intermediate focus: contains-tree + key story neighbors of the focus and
    // its important (non-advanced) children — never a whole-repo uncollapse.
    function focusNeighborhood(rootId) {
      const tree = descendants(rootId);
      const found = new Set(tree);
      const seeds = [];
      for (const id of tree) {
        if (id === rootId) {
          seeds.push(id);
          continue;
        }
        const node = byId.get(id);
        if (!node) continue;
        const isOverviewHub = node.metadata && node.metadata.overviewHub;
        if (advancedKinds.has(node.kind) && !isOverviewHub) continue;
        // Hidden nested routes (Comments under Articles) must not pull their
        // tables into the parent room — drill the hub to see those operations.
        if (!clusterMemberVisible(node, rootId)) continue;
        seeds.push(id);
      }
      for (const id of seeds) {
        for (const edge of outgoing.get(id) || []) {
          if (neighborhoodEdgeKinds.has(edge.kind)) found.add(edge.target);
        }
        for (const edge of incoming.get(id) || []) {
          if (neighborhoodEdgeKinds.has(edge.kind)) found.add(edge.source);
        }
      }
      return found;
    }

    // Intermediate-visible nodes inside a focus (no Advanced code kinds).
    function intermediateNeighborhoodNodes(rootId) {
      const allowed = focusNeighborhood(rootId);
      const focused = byId.get(rootId);
      return graph.nodes.filter((node) => {
        if (!allowed.has(node.id)) return false;
        if (node.kind === "product") return false;
        if (
          node.metadata &&
          (node.metadata.relationOnly ||
            node.metadata.joinTable ||
            node.metadata.exampleChrome ||
            node.metadata.leafChrome)
        ) {
          return false;
        }
        // FE shells: Protected/Auth/Public Intermediate = tools + API story neighbors.
        if (isShellHub(focused) && !shellToolStoryVisible(node, rootId)) {
          return false;
        }
        // FE tools: Dashboard/Settings Intermediate = tool + feature roots + API.
        if (
          isRouteMoleculeHub(focused) &&
          !routeToolStoryVisible(node, rootId)
        ) {
          return false;
        }
        if (!clusterMemberVisible(node, rootId)) return false;
        if (isHallwayTable(node, rootId)) return false;
        if (isMigrationSchemaLeaf(node) && node.id !== rootId) return false;
        if (isDataRoomApiLeftover(node, rootId)) return false;
        const isOverviewHub = node.metadata && node.metadata.overviewHub;
        if (advancedKinds.has(node.kind) && !isOverviewHub) return false;
        return true;
      });
    }

    // Advanced-visible nodes inside a focus (modules; functions only in code containers).
    function advancedNeighborhoodNodes(rootId) {
      const allowed = focusNeighborhood(rootId);
      const focused = byId.get(rootId);
      return graph.nodes.filter((node) => {
        if (!allowed.has(node.id)) return false;
        if (node.kind === "product") return false;
        if (
          node.metadata &&
          (node.metadata.relationOnly ||
            node.metadata.joinTable ||
            node.metadata.exampleChrome)
        ) {
          return false;
        }
        // leafChrome (Card/Button) is Advanced-only — keep here, hide Intermediate.
        // Route-group members stay Intermediate furniture of their group, not of
        // the parent API Advanced room (drill the Users/Articles hub instead).
        if (!clusterMemberVisible(node, rootId)) return false;
        const isOverviewHub = node.metadata && node.metadata.overviewHub;
        if (advancedKinds.has(node.kind) && !isOverviewHub) {
          if (node.kind === "function") {
            if (!focused) return false;
            if (broadFocusKinds.has(focused.kind)) return false;
            return functionFocusKinds.has(focused.kind);
          }
          return true;
        }
        return true;
      });
    }

    function countAdvancedContains(rootId) {
      let count = 0;
      for (const id of descendants(rootId)) {
        if (id === rootId) continue;
        const node = byId.get(id);
        if (!node) continue;
        const isOverviewHub = node.metadata && node.metadata.overviewHub;
        if (advancedKinds.has(node.kind) && !isOverviewHub) count += 1;
      }
      return count;
    }

    // Dead-end / thin-room fix: Intermediate leaf services escalate to the parent
    // system at Advanced so sibling modules appear. Product Flow boxes with almost
    // no Intermediate "room" (only other flow neighbors) open Advanced when they
    // own code — Extractors stays Intermediate because its service roster is rich.
    function intermediateRoomNodes(rootId) {
      return intermediateNeighborhoodNodes(rootId).filter((node) => {
        if (node.id === rootId) return true;
        // Other Product Flow systems are hallway neighbors, not room furniture.
        if (typeof flowOrderOf(node) === "number") return false;
        return true;
      });
    }

    function resolveWalkFocus(clickedId) {
      const clicked = byId.get(clickedId);
      if (!clicked) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }
      if (advancedKinds.has(clicked.kind)) {
        return { focusId: clickedId, tier: "advanced", selectedId: clickedId };
      }
      // FE shell hubs always open Intermediate routes (never thin-room Advanced).
      if (isShellHub(clicked)) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }
      // FE tools (route molecules) open Intermediate tool→API rooms, not Advanced.
      if (isRouteMoleculeHub(clicked)) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }
      // Domain groups + kind clusters are Intermediate rooms even when they
      // only contain one nested hub (H1 collapse must not thin-room to Advanced).
      if (
        clicked.metadata &&
        (clicked.metadata.routeGroup === true || clicked.metadata.kindCluster === true)
      ) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }
      // Scheduled work is a semantic room even when it has only one trigger,
      // one job, and one code handler. Enter the trigger/job story before code.
      if (
        clicked.metadata &&
        clicked.metadata.systemKey === "jobs" &&
        [...descendants(clickedId)].some((id) => {
          const node = byId.get(id);
          return (node?.semantics || []).some(
            (facet) => facet.kind === "trigger" || facet.kind === "job",
          );
        })
      ) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }

      const inter = intermediateNeighborhoodNodes(clickedId);
      const room = intermediateRoomNodes(clickedId);
      const roomOthers = room.filter((node) => node.id !== clickedId);
      // Rich Intermediate room (Extractors roster, Checkout routes, …).
      if (roomOthers.length >= 3) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }
      // Heart API Intermediate payoff is domain route groups (Users / Articles).
      // Prefer that room over a thin-room Advanced module dump.
      const routeGroupFurniture = roomOthers.filter(
        (node) =>
          node.metadata &&
          (node.metadata.routeGroup === true || node.metadata.kindCluster === true),
      );
      if (routeGroupFurniture.length >= 1) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }

      // Thin room with code under it → Advanced (CLI → src/cli.ts, not 4 lonely nodes).
      if (countAdvancedContains(clickedId) >= 1) {
        return { focusId: clickedId, tier: "advanced", selectedId: clickedId };
      }

      const interOthers = inter.filter((node) => node.id !== clickedId);
      if (interOthers.length >= 2) {
        return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
      }

      let walkParent = parentOf(clicked);
      while (
        walkParent &&
        walkParent.kind !== "system" &&
        walkParent.kind !== "pipeline" &&
        walkParent.kind !== "api" &&
        walkParent.kind !== "ui"
      ) {
        walkParent = parentOf(walkParent);
      }
      if (walkParent) {
        const parentAdv = advancedNeighborhoodNodes(walkParent.id);
        const modules = parentAdv.filter((node) => node.kind === "module");
        if (modules.length >= 1) {
          return { focusId: walkParent.id, tier: "advanced", selectedId: clickedId };
        }
        const parentInter = intermediateNeighborhoodNodes(walkParent.id);
        if (parentInter.length > inter.length) {
          return { focusId: walkParent.id, tier: "intermediate", selectedId: clickedId };
        }
      }

      const selfAdv = advancedNeighborhoodNodes(clickedId);
      if (selfAdv.length > inter.length) {
        return { focusId: clickedId, tier: "advanced", selectedId: clickedId };
      }

      return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
    }

    function visibleNodes() {
      let allowed = state.focus
        ? focusNeighborhood(state.focus)
        : new Set(graph.nodes.map((node) => node.id));
      // Search picks from a results list and enters a cluster — it must not
      // break calm overview into a whole-repo match dump / god-graph.
      const calmOverview = !state.focus;
      // When a Product Flow exists, calm overview is that band only — drill in
      // (double-click / search Enter) to see a system’s Intermediate neighborhood.
      const hasProductFlow =
        calmOverview &&
        graph.nodes.some(
          (node) => node.metadata && typeof node.metadata.flowOrder === "number",
        );
      return graph.nodes.filter((node) => {
        if (!allowed.has(node.id)) return false;
        // ORM relation fields + M2M join-table aliases stay collapsed;
        // table↔table edges / real models carry the story. Terraform
        // examples/wrappers and vpc_issue module chrome is the same kind of noise.
        if (
          node.metadata &&
          (node.metadata.relationOnly ||
            node.metadata.joinTable ||
            node.metadata.exampleChrome)
        ) {
          return false;
        }
        // Presentational FE leaves (Card/Button) stay off Beginner/Intermediate;
        // Advanced-in-focus may reveal them as code chrome.
        if (node.metadata && node.metadata.leafChrome && !isAdvancedTier()) {
          return false;
        }
        // FE shells Intermediate MVP: shell focus shows nested route molecules
        // only (not page atoms, feature roots, leaf chrome, or code flood).
        if (
          state.focus &&
          !isAdvancedTier() &&
          !shellRoutesOnlyVisible(node, state.focus)
        ) {
          return false;
        }
        // Trivial Mongo aggregate crumbs (C pipeline / Col pipeline) stay
        // off Beginner/Intermediate; Advanced-in-focus may still reveal them.
        if (
          node.metadata &&
          node.metadata.trivialMongoAggregate &&
          !isAdvancedTier()
        ) {
          return false;
        }
        // Detection surfaces live under capabilities — only show inside that
        // capability focus (never flood Extractors Intermediate with every surface).
        if (isDetectionSurface(node)) {
          if (!state.focus) return false;
          if (node.parentId === state.focus || node.id === state.focus) {
            /* keep */
          } else {
            return false;
          }
        }
        // Domain-grouped routes: only paint when their Users/Articles hub is focused
        // (API Intermediate shows groups, not the route phonebook).
        if (!clusterMemberVisible(node, state.focus)) return false;
        if (state.focus && !isAdvancedTier() && isHallwayTable(node, state.focus)) {
          return false;
        }
        if (
          state.focus &&
          !isAdvancedTier() &&
          isMigrationSchemaLeaf(node) &&
          node.id !== state.focus
        ) {
          return false;
        }
        if (state.focus && !isAdvancedTier() && isDataRoomApiLeftover(node, state.focus)) {
          return false;
        }
        // overviewHub (auth/billing actions, Helm Chart/resources, mongo
        // aggregates) bypasses advanced-kind hides so hubs can appear once the
        // user focuses a system (Intermediate neighborhood / Advanced-in-focus).
        const isOverviewHub = node.metadata && node.metadata.overviewHub;
        if (advancedKinds.has(node.kind) && !isOverviewHub) {
          // Cluster-scoped Advanced only — never a whole-repo function dump.
          if (!showsAdvancedKind(node)) return false;
        }
        // Calm overview: Product Flow + top systems only. Tables, queues,
        // crons, routes, etc. wait for a focused Intermediate neighborhood.
        if (calmOverview && intermediateKinds.has(node.kind)) {
          return false;
        }
        if (
          calmOverview &&
          node.metadata &&
          node.metadata.collapsedInOverview
        ) {
          return false;
        }
        if (
          hasProductFlow &&
          !(node.metadata && typeof node.metadata.flowOrder === "number")
        ) {
          return false;
        }
        if (node.kind === "product") return false;
        return true;
      });
    }

    function iconForKind(kind) {
      const paths = {
        module: '<path d="M3 6.5h6l2 2h10v10H3z"/><path d="M3 9h18"/>',
        system: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 5v14M14 5v14"/>',
        capability: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/><circle cx="17" cy="13" r="1.5"/>',
        service: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/>',
        component: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01M10 6h.01"/>',
        page: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M8 6h.01"/>',
        ui: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
        hook: '<path d="M7 4v9a5 5 0 0 0 10 0V8"/><path d="M14 8h6V2"/>',
        route: '<path d="M4 7h8a4 4 0 0 1 4 4v6"/><path d="m12 13 4 4 4-4"/>',
        api: '<path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14"/>',
        database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
        table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16M15 4v16"/>',
        column: '<rect x="7" y="3" width="10" height="18" rx="1"/><path d="M7 8h10M7 13h10M7 18h10"/>',
        collection: '<circle cx="8" cy="8" r="4"/><circle cx="16" cy="8" r="4"/><circle cx="12" cy="16" r="4"/>',
        cron: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
        job: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3"/>',
        queue: '<path d="M4 7h12M4 12h16M4 17h9"/><path d="m16 4 3 3-3 3"/>',
        topic: '<path d="M5 8a8 8 0 0 1 14 0M8 11a4.5 4.5 0 0 1 8 0"/><circle cx="12" cy="15" r="2"/>',
        pipeline: '<path d="M3 7h6l3 5 3-5h6M3 17h6l3-5 3 5h6"/>',
        "pipeline-step": '<path d="m4 6 6 6-6 6M11 6l6 6-6 6"/>',
        external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/>',
        config: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
        schema: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
        unknown: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.2c-.9.5-1.3 1-1.3 1.8M12 17h.01"/>'
      };
      if (kind === "function") return '<span class="function-mark">ƒ</span>';
      const path = paths[kind] || paths.unknown;
      return '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg>";
    }

    function certaintyOf(item) {
      if (item.evidence.some((entry) => entry.certainty === "inferred")) return "inferred";
      if (item.evidence.some((entry) => entry.certainty === "derived")) return "derived";
      return "observed";
    }

    // Intermediate calm: collapse ownership fans; gate structural hairlines.
    // Story edges (collab / narrative / relation / writes…) stay always-on.
    function showsStructuralEdge(edge) {
      if (ownershipEdgeKinds.has(edge.kind)) return false;
      if (!structuralHairlineKinds.has(edge.kind)) return true;
      if (isTableRelationEdge(edge)) return true;
      const selected =
        state.selected === edge.source || state.selected === edge.target;
      if (selected) return true;
      // Advanced-in-focus may show quiet hairlines inside the cluster.
      return isAdvancedTier() && !!state.focus;
    }

    function fallbackWidthForKind(kind) {
      if (kind === "function" || kind === "column") return 170;
      if (kind === "hook") return 176;
      if (kind === "system") return 210;
      return 190;
    }

    function flowOrderOf(node) {
      const value = node.metadata && node.metadata.flowOrder;
      return typeof value === "number" ? value : null;
    }

    function placeNode(node, x, y) {
      const manual = manualPositionFor(node.id);
      const placedX = manual ? manual.x : x;
      const placedY = manual ? manual.y : y;
      const element = document.createElement("div");
      element.className = "node" + (state.selected === node.id ? " selected" : "");
      if (state.nodeDrag && state.nodeDrag.id === node.id) element.classList.add("dragging");
      if (impactChanged.has(node.id)) element.classList.add("impact-changed");
      else if (impactHighlight.has(node.id)) element.classList.add("impact-hit");
      element.dataset.kind = node.kind;
      element.dataset.id = node.id;
      element.dataset.manualPosition = manual ? "true" : "false";
      if (node.metadata && node.metadata.role) element.dataset.role = node.metadata.role;
      if (node.metadata && node.metadata.kindCluster === true) element.dataset.kindCluster = "true";
      element.style.left = placedX + "px";
      element.style.top = placedY + "px";
      const kindLine = (node.metadata && node.metadata.kindCluster === true)
        ? ("cluster · " + (node.metadata.memberCount || "?") + " " + (node.metadata.clusterKind || "node") +
          ((node.metadata.memberCount === 1) ? "" : "s"))
        : (node.kind.replace("-", " ") + (node.technology ? " · " + node.technology : ""));
      element.innerHTML = '<div class="top"><span class="glyph">' + iconForKind(node.kind) + '</span><span class="label"></span></div><div class="kind">' + kindLine + "</div>";
      const label = element.querySelector(".label");
      label.textContent = node.label;
      label.title = node.label;
      element.onclick = (event) => {
        event.stopPropagation();
        if (state.suppressNodeClick === node.id) {
          state.suppressNodeClick = null;
          return;
        }
        selectNode(node.id);
      };
      element.ondblclick = (event) => { event.stopPropagation(); focusNode(node.id); };
      element.onpointerdown = (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const position = positionsScratch.get(node.id);
        if (!position) return;
        const rect = viewport.getBoundingClientRect();
        const worldX = (event.clientX - rect.left - state.x) / state.scale;
        const worldY = (event.clientY - rect.top - state.y) / state.scale;
        state.nodeDrag = {
          id: node.id,
          pointerId: event.pointerId,
          offsetX: worldX - position.x,
          offsetY: worldY - position.y,
          startClientX: event.clientX,
          startClientY: event.clientY,
          moved: false,
        };
      };
      nodesLayer.appendChild(element);
      nodeElementsScratch.set(node.id, element);
      const width = element.offsetWidth || fallbackWidthForKind(node.kind);
      const height = element.offsetHeight || 58;
      positionsScratch.set(node.id, { x: placedX, y: placedY, width, height });
      return placedY + height;
    }

    function edgeGeometry(source, target) {
      const sy = source.y + source.height / 2;
      const ty = target.y + target.height / 2;
      const sourceCenterX = source.x + source.width / 2;
      const targetCenterX = target.x + target.width / 2;
      const sameColumn = Math.abs(sourceCenterX - targetCenterX) < 48;
      if (sameColumn) {
        const sx = source.x + source.width;
        const tx = target.x + target.width;
        const midX = Math.max(sx, tx) + 56;
        return {
          d: "M " + sx + " " + sy + " C " + midX + " " + sy + ", " + midX + " " + ty + ", " + tx + " " + ty,
          mx: midX,
          my: (sy + ty) / 2,
        };
      }
      const routesRight = targetCenterX > sourceCenterX;
      const sx = routesRight ? source.x + source.width : source.x;
      const tx = routesRight ? target.x : target.x + target.width;
      const direction = routesRight ? 1 : -1;
      const bend = Math.max(35, Math.abs(tx - sx) * 0.45);
      return {
        d: "M " + sx + " " + sy + " C " + (sx + direction * bend) + " " + sy + ", " + (tx - direction * bend) + " " + ty + ", " + tx + " " + ty,
        mx: (sx + tx) / 2,
        my: (sy + ty) / 2,
      };
    }

    let positionsScratch = new Map();
    let nodeElementsScratch = new Map();

    function moveEdgeBadge(group, geometry) {
      const text = group.querySelector(".edge-badge");
      const background = group.querySelector(".edge-badge-bg");
      if (!text || !background) return;
      const width = Number(background.getAttribute("width")) || 42;
      const height = Number(background.getAttribute("height")) || 16;
      text.setAttribute("x", String(geometry.mx));
      text.setAttribute("y", String(geometry.my));
      background.setAttribute("x", String(geometry.mx - width / 2));
      background.setAttribute("y", String(geometry.my - height / 2));
    }

    function rerouteDraggedNode(nodeId, x, y) {
      const position = positionsScratch.get(nodeId);
      const element = nodeElementsScratch.get(nodeId);
      if (!position || !element) return;
      position.x = x;
      position.y = y;
      element.style.left = x + "px";
      element.style.top = y + "px";
      element.dataset.manualPosition = "true";
      element.classList.add("dragging");

      const bounds = contentBounds();
      if (bounds) {
        edgesLayer.setAttribute(
          "width",
          String(Math.max(Number(edgesLayer.getAttribute("width")) || 0, bounds.maxX + 100)),
        );
        edgesLayer.setAttribute(
          "height",
          String(Math.max(Number(edgesLayer.getAttribute("height")) || 0, bounds.maxY + 140)),
        );
      }

      for (const path of edgesLayer.querySelectorAll("path.edge")) {
        if (path.dataset.source !== nodeId && path.dataset.target !== nodeId) continue;
        const source = positionsScratch.get(path.dataset.source);
        const target = positionsScratch.get(path.dataset.target);
        if (!source || !target) continue;
        path.setAttribute("d", edgeGeometry(source, target).d);
      }
      for (const badge of edgesLayer.querySelectorAll(".edge-badge-group")) {
        if (badge.dataset.source !== nodeId && badge.dataset.target !== nodeId) continue;
        const source = positionsScratch.get(badge.dataset.source);
        const target = positionsScratch.get(badge.dataset.target);
        if (!source || !target) continue;
        moveEdgeBadge(badge, edgeGeometry(source, target));
      }
    }

    function render() {
      const visible = visibleNodes();
      const visibleIds = new Set(visible.map((node) => node.id));
      positionsScratch = new Map();
      nodeElementsScratch = new Map();
      const positions = positionsScratch;
      nodesLayer.innerHTML = "";
      let activeLanes = lanes.filter(
        (lane) => (isAdvancedTier() && state.focus) || lane.name !== "Code",
      );
      // Advanced payoff: Code sits beside Systems (not a far-right column).
      if (isAdvancedTier() && state.focus) {
        const systems = activeLanes.find((lane) => lane.name === "Systems");
        const code = activeLanes.find((lane) => lane.name === "Code");
        const rest = activeLanes.filter(
          (lane) => lane.name !== "Systems" && lane.name !== "Code",
        );
        activeLanes = [systems, code, ...rest].filter(Boolean);
      }
      // Capability focus: put Detects next to Systems (the payoff of the drill).
      if (state.focus) {
        const focused = byId.get(state.focus);
        if (focused && focused.kind === "capability") {
          const systems = activeLanes.find((lane) => lane.name === "Systems");
          const detects = activeLanes.find((lane) => lane.name === "Detects");
          const rest = activeLanes.filter(
            (lane) => lane.name !== "Systems" && lane.name !== "Detects",
          );
          activeLanes = [systems, detects, ...rest].filter(Boolean);
        }
      }
      const laneWidth = 240;
      // Product Flow wrap: ≤4 hubs per row so 6–8 Beginner hubs stay scannable
      // without a long horizontal hunt (second row + slightly tighter gap).
      const FLOW_WRAP_COLS = 4;
      const flowGapX = 230;
      const flowRowY = 96;
      let maxHeight = 0;
      let maxWidth = activeLanes.length * laneWidth + 200;

      const flowNodes = visible
        .filter((node) => flowOrderOf(node) !== null)
        .sort((a, b) => flowOrderOf(a) - flowOrderOf(b) || a.label.localeCompare(b.label));
      const flowIds = new Set(flowNodes.map((node) => node.id));
      let laneTop = 0;

      if (flowNodes.length) {
        const label = document.createElement("div");
        label.className = "lane-label";
        label.textContent = "Product flow";
        label.style.left = "0px";
        label.style.top = "0px";
        nodesLayer.appendChild(label);
        flowNodes.forEach((node, index) => {
          const col = index % FLOW_WRAP_COLS;
          const row = Math.floor(index / FLOW_WRAP_COLS);
          const x = col * flowGapX;
          const y = 34 + row * flowRowY;
          placeNode(node, x, y);
          maxHeight = Math.max(maxHeight, y + 70);
          maxWidth = Math.max(maxWidth, x + fallbackWidthForKind(node.kind) + 80);
        });
        const flowRows = Math.ceil(flowNodes.length / FLOW_WRAP_COLS);
        laneTop = 34 + flowRows * flowRowY + 28;
      }

      activeLanes.forEach((lane, laneIndex) => {
        const laneNodes = visible.filter((node) => laneNameFor(node) === lane.name && !flowIds.has(node.id));
        if (!laneNodes.length) return;
        const label = document.createElement("div");
        label.className = "lane-label";
        label.textContent = lane.name;
        label.style.left = (laneIndex * laneWidth) + "px";
        label.style.top = laneTop + "px";
        nodesLayer.appendChild(label);
        laneNodes.sort((a, b) => {
          const ao = flowOrderOf(a);
          const bo = flowOrderOf(b);
          if (ao !== null || bo !== null) return (ao ?? 999) - (bo ?? 999) || a.label.localeCompare(b.label);
          return a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label);
        });
        // Tables + Mongo collections + aggregate hubs: 2-column constellation
        // so RAG/query pipelines sit beside the collections they query.
        const tables = laneNodes.filter(
          (node) =>
            node.kind === "table" ||
            node.kind === "collection" ||
            isMongoAggregateHub(node),
        );
        const tableIds = new Set(tables.map((node) => node.id));
        const nonTables = laneNodes.filter((node) => !tableIds.has(node.id));
        let nextY = laneTop + 34;
        if (tables.length >= 2) {
          const colGap = 210;
          const rowGap = 88;
          tables.forEach((node, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = laneIndex * laneWidth + col * colGap;
            const y = laneTop + 34 + row * rowGap;
            placeNode(node, x, y);
            nextY = Math.max(nextY, y + rowGap);
            maxHeight = Math.max(maxHeight, y + 70);
            maxWidth = Math.max(maxWidth, x + fallbackWidthForKind(node.kind) + 80);
          });
        } else {
          tables.forEach((node) => {
            placeNode(node, laneIndex * laneWidth, nextY);
            nextY += 78;
            maxHeight = Math.max(maxHeight, nextY);
          });
        }
        nonTables.forEach((node) => {
          const x = laneIndex * laneWidth;
          placeNode(node, x, nextY);
          nextY += 78;
          maxHeight = Math.max(maxHeight, nextY);
        });
      });

      const measuredBounds = contentBounds();
      if (measuredBounds) {
        maxWidth = Math.max(maxWidth, measuredBounds.maxX + 100);
        maxHeight = Math.max(maxHeight, measuredBounds.maxY + 40);
      }
      edgesLayer.innerHTML = "";
      edgesLayer.setAttribute("width", String(maxWidth));
      edgesLayer.setAttribute("height", String(maxHeight + 100));
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      for (const [id, color] of [
        ["arrow-publishes", "#d17f54"],
        ["arrow-consumes", "#c48a5a"],
        ["arrow-migrates", "#52a976"],
        ["arrow-narrative", "#d09a45"],
        ["arrow-relation", "#52a976"],
        ["arrow-default", "#657080"],
        ["arrow-collab", "#6e8fe0"],
        ["arrow-active", "#7c9cff"],
      ]) {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", id);
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "9");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "7");
        marker.setAttribute("markerHeight", "7");
        marker.setAttribute("orient", "auto-start-reverse");
        const tip = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        tip.setAttribute("fill", color);
        marker.appendChild(tip);
        defs.appendChild(marker);
      }
      edgesLayer.appendChild(defs);

      // Group publishes/consumes/migrates by directed pair → one labeled path.
      const narrativeGroups = new Map();
      const narrativeEdgeIds = new Set();
      const narrativePairs = new Set();
      for (const edge of graph.edges) {
        if (!narrativeKinds.has(edge.kind)) continue;
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        if (!positions.get(edge.source) || !positions.get(edge.target)) continue;
        const key = edge.source + "|" + edge.target;
        if (!narrativeGroups.has(key)) narrativeGroups.set(key, []);
        narrativeGroups.get(key).push(edge);
        narrativeEdgeIds.add(edge.id);
        narrativePairs.add(key);
      }

      function narrativeBadgeLabel(edges) {
        const kinds = [...new Set(edges.map((edge) => edge.kind))];
        if (kinds.length === 1 && kinds[0] === "migrates") {
          const labels = [...new Set(edges.map((edge) => edge.label || "migrates"))];
          return labels.join(" · ");
        }
        const order = ["publishes", "consumes", "migrates"];
        return kinds
          .sort((a, b) => order.indexOf(a) - order.indexOf(b))
          .join(" · ");
      }

      function appendEdgeBadge(mx, my, label, selectionOnly, extraClass, sourceId, targetId) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const classes = ["edge-badge-group"];
        if (selectionOnly) classes.push("selection");
        if (extraClass) classes.push(extraClass);
        group.setAttribute("class", classes.join(" "));
        group.setAttribute("data-source", sourceId);
        group.setAttribute("data-target", targetId);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("class", "edge-badge");
        text.setAttribute("x", String(mx));
        text.setAttribute("y", String(my));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = label;
        // Measure after attach; approximate width from label length first.
        const width = Math.max(42, label.length * 6.2 + 12);
        const height = 16;
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("class", "edge-badge-bg");
        bg.setAttribute("x", String(mx - width / 2));
        bg.setAttribute("y", String(my - height / 2));
        bg.setAttribute("width", String(width));
        bg.setAttribute("height", String(height));
        bg.setAttribute("rx", "4");
        group.appendChild(bg);
        group.appendChild(text);
        edgesLayer.appendChild(group);
      }

      // On selection: leftover collab (unlabeled uses…). Skip flows-to and
      // operation-story edges (those get always-on badges in Intermediate).
      function selectionEdgeBadgeLabel(edge) {
        if (edge.kind === "flows-to") return null;
        if (isTableRelationEdge(edge)) return null;
        if (isOperationStoryEdge(edge)) return null;
        if (collaborationKinds.has(edge.kind)) {
          if (edge.label && edge.label !== edge.kind) return edge.label;
          return edge.kind;
        }
        return null;
      }

      function isOperationStoryEdge(edge) {
        if (edge.kind === "flows-to") return false;
        if (isTableRelationEdge(edge)) return false;
        if (narrativeKinds.has(edge.kind)) return false;
        if (edge.kind === "reads" || edge.kind === "writes" || edge.kind === "queries") {
          return true;
        }
        if (
          collaborationKinds.has(edge.kind) &&
          edge.label &&
          edge.label !== edge.kind
        ) {
          return true;
        }
        return !!(edge.metadata && edge.metadata.operationStory);
      }

      function operationBadgeLabel(edges, sourceId, targetId) {
        const source = byId.get(sourceId);
        const target = byId.get(targetId);
        const order = [
          "writes", "reads", "queries", "uses", "renders",
          "triggers", "exposes", "configures",
        ];
        const kinds = [...new Set(edges.map((edge) => edge.kind))].sort(
          (a, b) => order.indexOf(a) - order.indexOf(b),
        );
        const sourceIsRoute = !!(
          source &&
          (source.kind === "route" ||
            (source.semantics || []).some((facet) => facet.kind === "endpoint"))
        );
        const targetIsResource = !!(
          target &&
          (target.kind === "table" ||
            target.kind === "collection" ||
            isDataAccessSystem(target))
        );
        if (sourceIsRoute && targetIsResource) {
          if (kinds.includes("writes")) return "writes";
          if (kinds.includes("reads")) return "reads";
          return kinds.join(" · ");
        }
        if (target && (target.kind === "table" || target.kind === "collection")) {
          return kinds.join(" · ") + " " + target.label;
        }
        if (targetIsResource) return kinds.join(" · ");
        const labels = [...new Set(edges.map((edge) => {
          if (edge.label && edge.label !== edge.kind) return edge.label;
          return edge.kind;
        }))];
        return labels.join(" · ");
      }

      // Group table↔table relations by directed pair → one labeled green path.
      const relationGroups = new Map();
      const relationEdgeIds = new Set();
      for (const edge of graph.edges) {
        if (!isTableRelationEdge(edge)) continue;
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        if (!positions.get(edge.source) || !positions.get(edge.target)) continue;
        const key = edge.source + "|" + edge.target;
        if (!relationGroups.has(key)) relationGroups.set(key, []);
        relationGroups.get(key).push(edge);
        relationEdgeIds.add(edge.id);
      }

      for (const [key, edges] of narrativeGroups) {
        const sourceId = key.slice(0, key.indexOf("|"));
        const targetId = key.slice(key.indexOf("|") + 1);
        const source = positions.get(sourceId);
        const target = positions.get(targetId);
        if (!source || !target) continue;
        const geom = edgeGeometry(source, target);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", geom.d);
        const kinds = [...new Set(edges.map((edge) => edge.kind))];
        const classes = ["edge", "narrative", ...kinds];
        if (edges.some((edge) => certaintyOf(edge) === "inferred")) classes.push("inferred");
        else if (edges.some((edge) => certaintyOf(edge) === "derived")) classes.push("derived");
        const active = state.selected === sourceId || state.selected === targetId;
        if (active) classes.push("active");
        path.setAttribute("class", classes.join(" "));
        path.setAttribute("data-kind", kinds.join(" "));
        path.setAttribute("data-source", sourceId);
        path.setAttribute("data-target", targetId);
        path.setAttribute("data-narrative", "true");
        let marker = "arrow-narrative";
        if (active) marker = "arrow-active";
        else if (kinds.length === 1 && kinds[0] === "publishes") marker = "arrow-publishes";
        else if (kinds.length === 1 && kinds[0] === "consumes") marker = "arrow-consumes";
        else if (kinds.length === 1 && kinds[0] === "migrates") marker = "arrow-migrates";
        path.setAttribute("marker-end", "url(#" + marker + ")");
        edgesLayer.appendChild(path);
        appendEdgeBadge(
          geom.mx,
          geom.my,
          narrativeBadgeLabel(edges),
          false,
          "narrative",
          sourceId,
          targetId,
        );
      }

      for (const [key, edges] of relationGroups) {
        const sourceId = key.slice(0, key.indexOf("|"));
        const targetId = key.slice(key.indexOf("|") + 1);
        const source = positions.get(sourceId);
        const target = positions.get(targetId);
        if (!source || !target) continue;
        const geom = edgeGeometry(source, target);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", geom.d);
        const classes = ["edge", "relation"];
        if (edges.some((edge) => certaintyOf(edge) === "inferred")) classes.push("inferred");
        else if (edges.some((edge) => certaintyOf(edge) === "derived")) classes.push("derived");
        const active = state.selected === sourceId || state.selected === targetId;
        if (active) classes.push("active");
        path.setAttribute("class", classes.join(" "));
        path.setAttribute("data-kind", "depends-on");
        path.setAttribute("data-source", sourceId);
        path.setAttribute("data-target", targetId);
        path.setAttribute("data-relation", "true");
        path.setAttribute(
          "marker-end",
          "url(#" + (active ? "arrow-active" : "arrow-relation") + ")",
        );
        edgesLayer.appendChild(path);
        const labels = [...new Set(edges.map((edge) => relationLabelText(edge)))];
        appendEdgeBadge(
          geom.mx,
          geom.my,
          labels.join(" · "),
          false,
          "relation",
          sourceId,
          targetId,
        );
      }

      // Group operation story edges (reads/writes/queries, labeled uses…)
      // by directed pair into one labeled path. Intermediate should read
      // POST /articles writes Article, not anonymous blue lines.
      const operationGroups = new Map();
      const operationEdgeIds = new Set();
      for (const edge of graph.edges) {
        if (!isOperationStoryEdge(edge)) continue;
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        if (!positions.get(edge.source) || !positions.get(edge.target)) continue;
        const key = edge.source + "|" + edge.target;
        if (!operationGroups.has(key)) operationGroups.set(key, []);
        operationGroups.get(key).push(edge);
        operationEdgeIds.add(edge.id);
      }

      for (const [key, edges] of operationGroups) {
        const sourceId = key.slice(0, key.indexOf("|"));
        const targetId = key.slice(key.indexOf("|") + 1);
        const source = positions.get(sourceId);
        const target = positions.get(targetId);
        if (!source || !target) continue;
        const geom = edgeGeometry(source, target);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", geom.d);
        const kinds = [...new Set(edges.map((edge) => edge.kind))];
        const classes = ["edge", "collab", "operation", ...kinds];
        if (edges.some((edge) => certaintyOf(edge) === "inferred")) classes.push("inferred");
        else if (edges.some((edge) => certaintyOf(edge) === "derived")) classes.push("derived");
        const active = state.selected === sourceId || state.selected === targetId;
        if (active) classes.push("active");
        path.setAttribute("class", classes.join(" "));
        path.setAttribute("data-kind", kinds.join(" "));
        path.setAttribute("data-source", sourceId);
        path.setAttribute("data-target", targetId);
        path.setAttribute("data-operation", "true");
        path.setAttribute(
          "marker-end",
          "url(#" + (active ? "arrow-active" : "arrow-collab") + ")",
        );
        edgesLayer.appendChild(path);
        const alwaysOn = state.tier !== "beginner" || !!state.focus;
        if (alwaysOn) {
          appendEdgeBadge(
            geom.mx,
            geom.my,
            operationBadgeLabel(edges, sourceId, targetId),
            false,
            "operation",
            sourceId,
            targetId,
          );
        }
      }

      // Collapse structural hairlines by directed pair (one quiet path, not a fan).
      const structuralDrawn = new Set();
      for (const edge of graph.edges) {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        if (narrativeEdgeIds.has(edge.id)) continue;
        if (relationEdgeIds.has(edge.id)) continue;
        if (operationEdgeIds.has(edge.id)) continue;
        // Ownership fans (contains) + unselected derived depends-on/calls stay off
        // Intermediate canvas — neighborhood layout already shows children.
        if (!showsStructuralEdge(edge)) continue;
        // contains under a labeled messaging/migration story just restates ownership.
        if (
          edge.kind === "contains" &&
          narrativePairs.has(edge.source + "|" + edge.target)
        ) {
          continue;
        }
        const isStructuralHairline =
          structuralHairlineKinds.has(edge.kind) && !isTableRelationEdge(edge);
        if (isStructuralHairline) {
          const pairKey = edge.kind + "|" + edge.source + "|" + edge.target;
          if (structuralDrawn.has(pairKey)) continue;
          structuralDrawn.add(pairKey);
        }
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const geom = edgeGeometry(source, target);
        path.setAttribute("d", geom.d);
        const classes = ["edge", certaintyOf(edge)];
        if (isStructuralHairline) classes.push("structural");
        if (collaborationKinds.has(edge.kind)) {
          classes.push("collab");
          if (edge.kind === "flows-to") classes.push("flows-to");
        }
        const selected =
          state.selected === edge.source || state.selected === edge.target;
        if (selected) classes.push("active");
        path.setAttribute("class", classes.join(" "));
        path.setAttribute("data-kind", edge.kind);
        path.setAttribute("data-source", edge.source);
        path.setAttribute("data-target", edge.target);
        path.setAttribute(
          "marker-end",
          "url(#" + (selected ? "arrow-active" : collaborationKinds.has(edge.kind) ? "arrow-collab" : "arrow-default") + ")",
        );
        if (isStructuralHairline) path.setAttribute("data-structural", "true");
        edgesLayer.appendChild(path);
        // Selection reveals what blue collab lines mean on-canvas.
        if (selected) {
          const badge = selectionEdgeBadgeLabel(edge);
          if (badge) {
            path.setAttribute("data-selection-label", "true");
            appendEdgeBadge(
              geom.mx,
              geom.my,
              badge,
              true,
              null,
              edge.source,
              edge.target,
            );
          }
        }
      }
      highlightNeighborhood();
      const focused = state.focus ? byId.get(state.focus) : null;
      const crumb = document.getElementById("focus-crumb");
      if (crumb) {
        const stack = focusStack();
        if (stack.length === 0) {
          crumb.hidden = true;
          crumb.innerHTML = "";
        } else {
          crumb.hidden = false;
          const parts = [];
          parts.push('<button type="button" class="crumb" data-stack="-1" title="Back to Beginner overview">Overview</button>');
          stack.forEach((id, index) => {
            const node = byId.get(id);
            const label = escapeHtml(node ? node.label : id);
            const isCurrent = index === stack.length - 1;
            const title = isCurrent
              ? (isAdvancedTier() ? "Code in focus" : "Current focus")
              : "Back to this focus";
            parts.push('<span class="crumb-sep" aria-hidden="true">›</span>');
            if (isCurrent) {
              parts.push(
                '<span class="crumb current" title="' + title + '">' +
                label +
                (isAdvancedTier() ? " · code" : "") +
                "</span>",
              );
            } else {
              parts.push(
                '<button type="button" class="crumb" data-stack="' + index + '" title="' + title + '">' +
                label +
                "</button>",
              );
            }
          });
          crumb.innerHTML = parts.join("");
          crumb.querySelectorAll("button.crumb[data-stack]").forEach((button) => {
            button.onclick = (event) => {
              event.stopPropagation();
              navigateFocusStack(Number(button.dataset.stack));
            };
          });
        }
      }
      const visibleRelationships = edgesLayer.querySelectorAll("path.edge").length;
      document.getElementById("counts").textContent = focused
        ? (isAdvancedTier()
            ? visible.length + " in focus · " + visibleRelationships + " visible relationships · " + graph.edges.length + " total"
            : visible.length + " in neighborhood · " + visibleRelationships + " visible relationships · " + graph.edges.length + " total")
        : visible.length + " components · " + visibleRelationships + " visible relationships · " + graph.edges.length + " total";
      const backBtn = document.getElementById("back");
      backBtn.hidden = !state.focus && state.history.length === 0;
      const backStack = focusStack();
      const backParentId = backStack.length >= 2 ? backStack[backStack.length - 2] : null;
      const backLabel = backParentId
        ? (byId.get(backParentId)?.label || "previous")
        : "Beginner";
      backBtn.title = "Back to " + backLabel + " (Esc)";
      const walkHint = document.getElementById("walk-hint");
      if (walkHint) walkHint.textContent = walkHintText();
    }

    function highlightNeighborhood() {
      if (!state.selected) return;
      const related = new Set([state.selected]);
      for (const edge of outgoing.get(state.selected) || []) related.add(edge.target);
      for (const edge of incoming.get(state.selected) || []) related.add(edge.source);
      document.querySelectorAll(".node").forEach((element) => {
        element.classList.toggle("dim", !related.has(element.dataset.id));
      });
    }

    // Structured inspector sections own these keys (avoid raw pill dump).
    // Compiler internals (projection/systemKey/flowOrder) stay hidden — North-star
    // founders need product evidence, not projection machinery chrome.
    // path/framework/readme* fold into plainLanguageRole — not leftover pills.
    const structuredMetaKeys = new Set([
      "keyFiles", "binEntries", "binCommands", "packageExports", "extractorRoster", "adapterRoster",
      "prismaName", "sqlName", "sources", "aliases", "normalizedTable",
      "publishers", "consumers", "messagingHub",
      "projection", "systemKey", "flowOrder",
      "role", "extractorId", "adapterId", "capabilityKind", "detectionSurface", "surfaceId", "detail",
      "projectedSystem",
      // Docker Compose story — owned by the Container inspector section.
      "docker", "dockerService", "dockerfileService", "serviceName",
      "image", "build", "ports", "hostPorts", "dependsOn", "from", "expose",
      "dockerCompose", "dockerfile", "dockerModule", "technicalLabel",
      "composeFiles",
      // Kubernetes story — kind/name/hosts/needs owned by the Workload section.
      "kubernetes", "kubernetesResource", "kubernetesModule",
      "k8sKind", "resourceName", "apiVersion", "namespace", "address",
      "selector", "matchLabels", "hosts", "backendServices", "kustomizeChrome",
      // Helm Chart.yaml + templates — Chart/version + kind/name owned by Chart section.
      "helm", "helmChart", "helmResource", "helmModule", "helmChartYaml",
      "helmTemplate", "chartName", "chartVersion", "chartRoot", "appVersion",
      "helmChartOnlyChrome", "helmModuleTwinChrome", "helmBesideOverlayChrome",
      // Kustomize overlays — Base/Overlay/namespace owned by Overlay inspector section.
      "kustomize", "kustomization", "kustomizeModule", "kustomizationYaml",
      "overlayName", "overlayRoot", "namePrefix", "nameSuffix", "resources",
      "kustomizeRole", "kustomizeModuleTwinChrome",
      "exampleChrome", "leafChrome", "featureRoot", "labelSource", "pathRoleLabel",
      "collapsedInOverview",
      "overviewHub",
      "routeGroup", "routeGroupMember", "routeDomain", "routeMolecule",
      "routeGroupNested", "routeSubresource",
      "kindCluster", "kindClusterMember", "clusterKind", "memberCount",
      "shellHub", "shell", "access", "surface", "reachability", "projectedShell",
      "intermediateOmitted", "intermediateOmitReason",
      "beginnerRouteHub", "beginnerOmitted", "beginnerOmitReason", "beginnerHero",
      "replacedByRouteMolecules",
      "uiOnly", "uiOnlyReason",
      "path", "method", "framework", "operationId", "summary", "openapi", "next",
      "readmeHeading", "readmeTitle",
      "fileCount", "packageName",
    ]);

    // Plain-language hub role for the inspector lead (not kind · semantic chrome).
    function plainLanguageRole(node) {
      const meta = node.metadata || {};
      if (meta.uiOnly === true) {
        return "UI-only product — no static API, Data, or Jobs evidence";
      }
      if (meta.shellHub === true) {
        if (meta.shell === "auth") return "Auth gate — sign-in routes";
        if (meta.shell === "protected") return "Protected app — nested routes";
        if (meta.shell === "public") return "Public shell — marketing routes";
        return "Front-end access shell";
      }
      if (meta.routeGroupNested === true) {
        const sub = typeof meta.routeSubresource === "string" && meta.routeSubresource
          ? meta.routeSubresource
          : "subresource";
        return "Route group · " + sub + " (projection, not a product system)";
      }
      if (meta.routeGroup === true) {
        const domain = typeof meta.routeDomain === "string" && meta.routeDomain
          ? meta.routeDomain
          : "domain";
        return "Route group · " + domain;
      }
      if (meta.kindCluster === true) {
        const count = typeof meta.memberCount === "number" ? meta.memberCount : 0;
        const clustered = typeof meta.clusterKind === "string" && meta.clusterKind
          ? meta.clusterKind
          : "node";
        return "Clustered view — " + count + " " + clustered +
          (count === 1 ? "" : "s") + " (projection, not a product system)";
      }
      if (meta.routeMolecule === true) {
        const path = typeof meta.path === "string" && meta.path ? meta.path : "";
        const fw = typeof meta.framework === "string" && meta.framework ? meta.framework : "";
        if (path && fw) return "Front-end page (" + fw + ") · " + path;
        if (path) return "Front-end page · " + path;
        return "Front-end page hub";
      }
      if (typeof meta.pathRoleLabel === "string" && meta.pathRoleLabel) {
        return String(meta.pathRoleLabel);
      }
      const key = typeof meta.systemKey === "string" ? meta.systemKey : "";
      if (key === "api") return "HTTP API";
      if (key === "data") return "Data access";
      if (key === "jobs") return "Scheduled jobs";
      if (key === "workers") return "Queue workers";
      if (key === "pipelines") return "Pipelines";
      if (key === "ui") return "Front-end";
      if (key === "deploy") return "Deploy";
      if (key.startsWith("page:")) {
        const path = typeof meta.path === "string" && meta.path
          ? meta.path
          : key.slice("page:".length);
        return path ? "Front-end page · " + path : "Front-end page hub";
      }
      const deployUnit = (node.semantics || []).find((facet) => facet.kind === "deploy-unit");
      if (deployUnit) {
        const roles = {
          service: "Network service",
          workload: "Runtime workload",
          serverless: "Serverless unit",
          container: "Container",
          "scheduled-workload": "Scheduled workload",
          infrastructure: "Infrastructure resource",
          package: "Deployment package",
          overlay: "Deployment overlay",
        };
        return roles[deployUnit.deployKind] || "Deploy unit";
      }
      if (meta.docker) return "Container service";
      if (meta.kubernetes) return "Kubernetes workload";
      if (meta.helm) return "Helm chart unit";
      if (meta.kustomization) {
        return meta.kustomizeRole === "base" ? "Kustomize base" : "Kustomize overlay";
      }
      if (node.kind === "product") {
        const pkg = typeof meta.packageName === "string" && meta.packageName
          ? meta.packageName
          : "";
        return pkg ? "Product · " + pkg : "Product root";
      }
      if (node.kind === "table") return "Database table";
      if (node.kind === "collection") return "Document collection";
      if ((node.semantics || []).some((facet) => facet.kind === "endpoint")) {
        return "HTTP endpoint";
      }
      if (node.kind === "route") return "HTTP route";
      if (node.kind === "page") return "Page";
      if (node.kind === "module") return "Source module";
      if (node.kind === "function") return "Function";
      if ((node.semantics || []).some((facet) => facet.kind === "trigger")) {
        return "Scheduled trigger";
      }
      if ((node.semantics || []).some((facet) => facet.kind === "job")) {
        return "Scheduled job";
      }
      const tech =
        node.technology && node.technology !== "semantic"
          ? " · " + node.technology
          : "";
      return node.kind + tech;
    }

    // Prefer explicit data bindings before weaker collaboration kinds.
    const storyNeighborRank = {
      reads: 0,
      writes: 1,
      queries: 2,
      uses: 3,
      renders: 4,
      "flows-to": 5,
      exposes: 6,
      triggers: 7,
      configures: 8,
    };

    function connectionButton(edge, id) {
      const other = byId.get(edge.source === id ? edge.target : edge.source);
      return '<button class="pill connection" data-id="' + (other?.id || "") + '">' + edge.kind + " · " + (other?.label || "unknown") + "</button>";
    }

    function nodeIdByLabel(label) {
      for (const node of byId.values()) {
        if (node.label === label) return node.id;
      }
      return "";
    }

    // Messaging hubs: show who publishes / who consumes before raw edge pills.
    function messagingRolesHtml(node) {
      if (node.kind !== "queue" && node.kind !== "topic") return "";
      const meta = node.metadata || {};
      const publishers = Array.isArray(meta.publishers) ? meta.publishers : [];
      const consumers = Array.isArray(meta.consumers) ? meta.consumers : [];
      if (!publishers.length && !consumers.length) return "";
      function roleList(labels, role) {
        if (!labels.length) return "";
        const pills = labels.map((label) => {
          const id = nodeIdByLabel(label);
          return '<button class="pill connection" data-id="' + id + '">' + label + "</button>";
        }).join("");
        return '<div class="messaging-role"><p class="messaging-role-label">' + role + "</p>" + pills + "</div>";
      }
      const hubNote = meta.messagingHub
        ? '<p class="messaging-hub-note">Messaging hub</p>'
        : "";
      return "<h3>Messaging</h3>" + hubNote + roleList(publishers, "Publishers") + roleList(consumers, "Consumers");
    }

    function scheduledWorkHtml(node) {
      const semantics = Array.isArray(node.semantics) ? node.semantics : [];
      const trigger = semantics.find((facet) => facet.kind === "trigger");
      const job = semantics.find((facet) => facet.kind === "job");
      if (!trigger && !job) return "";
      const pills = [];
      if (trigger) {
        pills.push('<span class="pill">Type: ' + escapeHtml(trigger.triggerKind) + "</span>");
        pills.push('<span class="pill">Provider: ' + escapeHtml(trigger.provider) + "</span>");
        if (trigger.expression) {
          pills.push('<span class="pill">Expression: ' + escapeHtml(trigger.expression) + "</span>");
        }
        if (trigger.timezone) {
          pills.push('<span class="pill">Timezone: ' + escapeHtml(trigger.timezone) + "</span>");
        }
        pills.push('<span class="pill">Declared in: ' + escapeHtml(trigger.declaration) + "</span>");
        return "<h3>Schedule</h3>" + pills.join("");
      }
      pills.push('<span class="pill">Execution: ' + escapeHtml(job.executionKind) + "</span>");
      pills.push('<span class="pill">Provider: ' + escapeHtml(job.provider) + "</span>");
      if (job.handler) {
        pills.push('<span class="pill">Handler: ' + escapeHtml(job.handler) + "</span>");
      }
      return "<h3>Job</h3>" + pills.join("");
    }

    function httpEndpointHtml(node) {
      const semantics = Array.isArray(node.semantics) ? node.semantics : [];
      const endpoint = semantics.find((facet) => facet.kind === "endpoint");
      if (!endpoint) return "";
      const pills = [
        '<span class="pill">Method: ' + escapeHtml(endpoint.method) + "</span>",
        '<span class="pill">Path: ' + escapeHtml(endpoint.path) + "</span>",
        '<span class="pill">Provider: ' + escapeHtml(endpoint.provider) + "</span>",
        '<span class="pill">Declared in: ' + escapeHtml(endpoint.declaration) + "</span>",
      ];
      if (endpoint.operationId) {
        pills.push('<span class="pill">Operation: ' + escapeHtml(endpoint.operationId) + "</span>");
      }
      if (endpoint.summary) {
        pills.push('<span class="pill">Summary: ' + escapeHtml(endpoint.summary) + "</span>");
      }
      const handlers = (outgoing.get(node.id) || [])
        .filter((edge) => edge.kind === "routes-to")
        .map((edge) => byId.get(edge.target))
        .filter(Boolean)
        .map((handler) =>
          '<button class="pill connection" data-id="' + handler.id + '">Handler: ' + escapeHtml(handler.label) + "</button>"
        )
        .join("");
      return "<h3>HTTP endpoint</h3>" + pills.join("") + handlers;
    }

    function dataResourceHtml(node) {
      const semantics = Array.isArray(node.semantics) ? node.semantics : [];
      const resource = semantics.find((facet) => facet.kind === "resource");
      if (!resource) return "";
      const pills = [
        '<span class="pill">Resource: ' + escapeHtml(resource.resourceKind) + "</span>",
      ];
      if (resource.provider) {
        pills.push('<span class="pill">Provider: ' + escapeHtml(resource.provider) + "</span>");
      }
      return "<h3>Data resource</h3>" + pills.join("");
    }

    function kindClusterHtml(node) {
      if (!isKindClusterHub(node)) return "";
      const members = graph.nodes
        .filter((child) => child.parentId === node.id && isKindClusterMember(child))
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));
      const count = typeof node.metadata.memberCount === "number"
        ? node.metadata.memberCount
        : members.length;
      const clustered = typeof node.metadata.clusterKind === "string"
        ? node.metadata.clusterKind
        : "node";
      const pills = members.slice(0, 12).map((member) =>
        '<button class="pill connection" data-id="' + member.id + '">' +
          escapeHtml(member.label) +
        "</button>",
      ).join("");
      const extra = members.length > 12
        ? '<p class="inspector-more">+' + (members.length - 12) + " more — double-click this hub to walk them</p>"
        : "";
      return "<h3>Clustered members</h3><p>This hub is a view of " +
        count + " " + escapeHtml(clustered) + (count === 1 ? "" : "s") +
        " — evidence still lives on the real nodes.</p>" + pills + extra;
    }

    function deployUnitHtml(node) {
      const semantics = Array.isArray(node.semantics) ? node.semantics : [];
      const unit = semantics.find((facet) => facet.kind === "deploy-unit");
      if (!unit) return "";
      const pills = [
        '<span class="pill">Type: ' + escapeHtml(unit.deployKind) + "</span>",
        '<span class="pill">Provider: ' + escapeHtml(unit.provider) + "</span>",
      ];
      if (unit.nativeKind) {
        pills.push('<span class="pill">Kind: ' + escapeHtml(unit.nativeKind) + "</span>");
      }
      if (unit.name) {
        pills.push('<span class="pill">Name: ' + escapeHtml(unit.name) + "</span>");
      }
      if (unit.namespace) {
        pills.push('<span class="pill">Namespace: ' + escapeHtml(unit.namespace) + "</span>");
      }
      if (unit.image) {
        pills.push('<span class="pill">Image: ' + escapeHtml(unit.image) + "</span>");
      }
      if (Array.isArray(unit.ports) && unit.ports.length) {
        pills.push('<span class="pill">Ports: ' + unit.ports.map(escapeHtml).join(", ") + "</span>");
      }
      if (unit.address) {
        pills.push('<span class="pill">Address: ' + escapeHtml(unit.address) + "</span>");
      }
      return "<h3>Deploy unit</h3>" + pills.join("");
    }

    // Collaboration edges carry human detail on evidence (how systems connect).
    function edgeDetailText(edge) {
      for (const item of edge.evidence || []) {
        if (item.detail) return item.detail;
      }
      return edge.label || "";
    }

    function collaborationItem(edge, id) {
      const other = byId.get(edge.source === id ? edge.target : edge.source);
      const otherLabel = other?.label || "unknown";
      const detail = edgeDetailText(edge);
      let caption = edge.kind + " · " + otherLabel;
      if (edge.label && edge.label !== edge.kind) {
        caption = edge.label.endsWith(" " + otherLabel)
          ? edge.label
          : edge.label + " · " + otherLabel;
      } else if (
        edge.kind === "reads" ||
        edge.kind === "writes" ||
        edge.kind === "queries"
      ) {
        caption = edge.kind + " · " + otherLabel;
      }
      const button = '<button class="pill connection" data-id="' + (other?.id || "") + '">' + caption + "</button>";
      const detailHtml = detail
        ? '<p class="collab-detail">' + detail + "</p>"
        : "";
      return '<div class="collab-edge">' + button + detailHtml + "</div>";
    }

    // Compose / Dockerfile services: ports · image · depends_on as product words.
    function containerStoryHtml(node, connections) {
      if (node.kind !== "service" || !(node.metadata && node.metadata.docker)) {
        return "";
      }
      const meta = node.metadata || {};
      const pills = [];
      if (typeof meta.image === "string" && meta.image) {
        pills.push('<span class="pill">Image: ' + meta.image + "</span>");
      }
      if (typeof meta.build === "string" && meta.build) {
        pills.push('<span class="pill">Build: ' + meta.build + "</span>");
      }
      const hostPorts = Array.isArray(meta.hostPorts) ? meta.hostPorts : [];
      if (hostPorts.length) {
        pills.push('<span class="pill">Ports: ' + hostPorts.join(", ") + "</span>");
      } else if (Array.isArray(meta.expose) && meta.expose.length) {
        pills.push('<span class="pill">Expose: ' + meta.expose.join(", ") + "</span>");
      }
      if (typeof meta.from === "string" && meta.from) {
        pills.push('<span class="pill">From: ' + meta.from + "</span>");
      }
      const depends = connections.filter((edge) => {
        if (edge.kind !== "depends-on") return false;
        if (edge.source !== node.id) return false;
        const other = byId.get(edge.target);
        return !!(other && other.kind === "service" && other.metadata && other.metadata.docker);
      });
      const dependLinks = depends.slice(0, 8).map((edge) => {
        const other = byId.get(edge.target);
        return '<button class="pill connection" data-id="' + (other?.id || "") + '">needs · ' + (other?.label || "service") + "</button>";
      }).join("");
      if (!pills.length && !dependLinks) return "";
      return "<h3>Container</h3>" + pills.join("") + (dependLinks ? '<p class="table-migrations">' + dependLinks + "</p>" : "");
    }

    // Kubernetes resources: Ingress hosts · Service→Deployment needs as product words.
    function workloadStoryHtml(node, connections) {
      if (node.kind !== "service" || !(node.metadata && node.metadata.kubernetes)) {
        return "";
      }
      const meta = node.metadata || {};
      const pills = [];
      if (typeof meta.k8sKind === "string" && meta.k8sKind) {
        pills.push('<span class="pill">Kind: ' + meta.k8sKind + "</span>");
      }
      const hosts = Array.isArray(meta.hosts) ? meta.hosts.filter(Boolean) : [];
      if (hosts.length) {
        pills.push('<span class="pill">Host: ' + hosts.join(", ") + "</span>");
      }
      const depends = connections.filter((edge) => {
        if (edge.kind !== "depends-on") return false;
        if (edge.source !== node.id) return false;
        const other = byId.get(edge.target);
        return !!(other && other.kind === "service" && other.metadata && other.metadata.kubernetes);
      });
      const dependLinks = depends.slice(0, 8).map((edge) => {
        const other = byId.get(edge.target);
        return '<button class="pill connection" data-id="' + (other?.id || "") + '">needs · ' + (other?.label || "workload") + "</button>";
      }).join("");
      if (!pills.length && !dependLinks) return "";
      return "<h3>Kubernetes</h3>" + pills.join("") + (dependLinks ? '<p class="table-migrations">' + dependLinks + "</p>" : "");
    }

    // Helm charts: Chart.yaml identity + template kind/host/needs as product words.
    function chartStoryHtml(node, connections) {
      if (node.kind !== "service" || !(node.metadata && node.metadata.helm)) {
        return "";
      }
      const meta = node.metadata || {};
      const pills = [];
      if (meta.helmChart) {
        pills.push('<span class="pill">Chart</span>');
        if (typeof meta.chartVersion === "string" && meta.chartVersion) {
          pills.push('<span class="pill">Version: ' + meta.chartVersion + "</span>");
        }
        if (typeof meta.appVersion === "string" && meta.appVersion) {
          pills.push('<span class="pill">App: ' + meta.appVersion + "</span>");
        }
      }
      if (typeof meta.k8sKind === "string" && meta.k8sKind) {
        pills.push('<span class="pill">Kind: ' + meta.k8sKind + "</span>");
      }
      if (typeof meta.chartName === "string" && meta.chartName && meta.helmResource) {
        pills.push('<span class="pill">Chart: ' + meta.chartName + "</span>");
      }
      const hosts = Array.isArray(meta.hosts) ? meta.hosts.filter(Boolean) : [];
      if (hosts.length) {
        pills.push('<span class="pill">Host: ' + hosts.join(", ") + "</span>");
      }
      const depends = connections.filter((edge) => {
        if (edge.kind !== "depends-on") return false;
        if (edge.source !== node.id) return false;
        const other = byId.get(edge.target);
        return !!(other && other.kind === "service" && other.metadata && other.metadata.helm);
      });
      const dependLinks = depends.slice(0, 8).map((edge) => {
        const other = byId.get(edge.target);
        return '<button class="pill connection" data-id="' + (other?.id || "") + '">needs · ' + (other?.label || "chart unit") + "</button>";
      }).join("");
      if (!pills.length && !dependLinks) return "";
      return "<h3>Chart</h3>" + pills.join("") + (dependLinks ? '<p class="table-migrations">' + dependLinks + "</p>" : "");
    }

    // Kustomize bases/overlays: kustomization.yaml identity as product words.
    function overlayStoryHtml(node) {
      if (node.kind !== "service" || !(node.metadata && node.metadata.kustomization)) {
        return "";
      }
      const meta = node.metadata || {};
      const role = meta.kustomizeRole === "base" ? "Base" : "Overlay";
      const pills = ['<span class="pill">' + role + "</span>"];
      if (typeof meta.namespace === "string" && meta.namespace) {
        pills.push('<span class="pill">Namespace: ' + meta.namespace + "</span>");
      }
      if (typeof meta.namePrefix === "string" && meta.namePrefix) {
        pills.push('<span class="pill">Prefix: ' + meta.namePrefix + "</span>");
      }
      if (Array.isArray(meta.resources) && meta.resources.length) {
        pills.push('<span class="pill">Resources: ' + meta.resources.length + "</span>");
      }
      return "<h3>" + role + "</h3>" + pills.join("");
    }

    // Unified tables: explain Prisma/SQL dual identity + migration lineage.
    function tableSourcesHtml(node, incomingEdges) {
      if (node.kind !== "table") return "";
      const meta = node.metadata || {};
      const pills = [];
      if (meta.prismaName) pills.push('<span class="pill">prismaName: ' + String(meta.prismaName) + "</span>");
      if (meta.sqlName) pills.push('<span class="pill">sqlName: ' + String(meta.sqlName) + "</span>");
      if (Array.isArray(meta.sources)) {
        for (const source of meta.sources) {
          pills.push('<span class="pill">source: ' + String(source) + "</span>");
        }
      }
      if (Array.isArray(meta.aliases) && meta.aliases.length) {
        pills.push('<span class="pill">aliases: ' + meta.aliases.join(", ") + "</span>");
      }
      const migrates = incomingEdges.filter((edge) => edge.kind === "migrates");
      const migrationLinks = migrates.slice(0, 8).map((edge) => {
        const migration = byId.get(edge.source);
        const action = edge.label || "migrates";
        return '<button class="pill connection" data-id="' + (migration?.id || "") + '">' + action + " · " + (migration?.label || "migration") + "</button>";
      }).join("");
      if (!pills.length && !migrationLinks) return "";
      return "<h3>Prisma / SQL</h3>" + pills.join("") + (migrationLinks ? '<p class="table-migrations">' + migrationLinks + "</p>" : "");
    }

    function isTableNode(id) {
      const node = byId.get(id);
      return !!(node && node.kind === "table");
    }

    // Table↔table depends-on edges carry Prisma/SQL relation names (payments / order).
    function isTableRelationEdge(edge) {
      return edge.kind === "depends-on" && isTableNode(edge.source) && isTableNode(edge.target);
    }

    function isDataAccessSystem(node) {
      if (!node || node.kind !== "system") return false;
      const meta = node.metadata || {};
      return meta.systemKey === "data" || meta.pathRoleLabel === "Data access";
    }

    function relationLabelText(edge) {
      if (edge.label && edge.label !== "depends-on") return edge.label;
      for (const item of edge.evidence || []) {
        if (item.detail) return item.detail;
      }
      return "related";
    }

    function tableRelationItem(edge, fromId, toId) {
      const other = byId.get(toId);
      const label = relationLabelText(edge);
      const button = '<button class="pill connection" data-id="' + (other?.id || "") + '">' + (other?.label || "table") + "</button>";
      const detail = '<p class="relation-detail">via ' + label + "</p>";
      return '<div class="table-relation">' + button + detail + "</div>";
    }

    // Data access tables: surface named relations before generic connections.
    function tableRelationsHtml(node, connections) {
      if (node.kind === "table") {
        const relations = connections.filter(isTableRelationEdge);
        if (!relations.length) return "";
        const items = relations.slice(0, 16).map((edge) => {
          const otherId = edge.source === node.id ? edge.target : edge.source;
          return tableRelationItem(edge, node.id, otherId);
        }).join("");
        return "<h3>Relations</h3>" + items;
      }
      if (!isDataAccessSystem(node)) return "";
      // Aggregate child table↔table relations so Data access tells the schema story.
      const childTables = (outgoing.get(node.id) || [])
        .filter((edge) => edge.kind === "contains" && isTableNode(edge.target))
        .map((edge) => edge.target);
      const childSet = new Set(childTables);
      const seen = new Set();
      const items = [];
      for (const tableId of childTables) {
        const edges = [...(outgoing.get(tableId) || []), ...(incoming.get(tableId) || [])];
        for (const edge of edges) {
          if (!isTableRelationEdge(edge)) continue;
          if (!childSet.has(edge.source) || !childSet.has(edge.target)) continue;
          const pairKey = [edge.source, edge.target].sort().join("|") + "|" + (edge.label || "");
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          const label = relationLabelText(edge);
          items.push(
            '<div class="table-relation">' +
              '<button class="pill connection" data-id="' + (source?.id || "") + '">' + (source?.label || "table") + "</button>" +
              '<span class="pill">→</span>' +
              '<button class="pill connection" data-id="' + (target?.id || "") + '">' + (target?.label || "table") + "</button>" +
              '<p class="relation-detail">via ' + label + "</p>" +
            "</div>",
          );
        }
      }
      if (!items.length) return "";
      return "<h3>Relations</h3>" + items.slice(0, 16).join("");
    }

    function selectNode(id) {
      syncAnalysisButton(false);
      state.selected = id;
      const node = byId.get(id);
      if (!node) return;
      const incomingEdges = incoming.get(id) || [];
      const outgoingEdges = outgoing.get(id) || [];
      const connections = [...incomingEdges, ...outgoingEdges];
      const collaboration = connections.filter((edge) => collaborationKinds.has(edge.kind));
      const messaging = messagingRolesHtml(node);
      const httpEndpoint = httpEndpointHtml(node);
      const scheduledWork = scheduledWorkHtml(node);
      const dataResource = dataResourceHtml(node);
      const kindCluster = kindClusterHtml(node);
      const deployUnit = deployUnitHtml(node);
      // Table migration lineage is owned by the Prisma / SQL section.
      // Table↔table relation names are owned by the Relations section.
      // Queue publish/consume roles are owned by the Messaging section.
      const importsAndCalls = connections.filter((edge) => {
        if (collaborationKinds.has(edge.kind)) return false;
        if (httpEndpoint && edge.kind === "routes-to" && edge.source === node.id) return false;
        if (node.kind === "table" && edge.kind === "migrates") return false;
        if (node.kind === "table" && isTableRelationEdge(edge)) return false;
        if (
          messaging &&
          (node.kind === "queue" || node.kind === "topic") &&
          (edge.kind === "publishes" || edge.kind === "consumes")
        ) {
          return false;
        }
        return true;
      });
      const metadataEntries = Object.entries(node.metadata || {}).filter(([key]) => !structuredMetaKeys.has(key));
      // Leftover IR pills are de-emphasized under More — never lead the panel.
      const metadata = metadataEntries.map(([key, value]) => '<span class="pill">' + key + ": " + String(value) + "</span>").join("");
      const containerStory = containerStoryHtml(node, connections);
      const workloadStory = workloadStoryHtml(node, connections);
      const chartStory = chartStoryHtml(node, connections);
      const overlayStory = overlayStoryHtml(node);
      const tableSources = tableSourcesHtml(node, incomingEdges);
      const tableRelations = tableRelationsHtml(node, connections);
      // Story-first: rank explicit data neighbors, then other collaboration.
      const storyNeighbors = [...collaboration].sort((a, b) => {
        const ar = storyNeighborRank[a.kind];
        const br = storyNeighborRank[b.kind];
        const av = typeof ar === "number" ? ar : 99;
        const bv = typeof br === "number" ? br : 99;
        if (av !== bv) return av - bv;
        return (a.kind || "").localeCompare(b.kind || "");
      });
      const collabLinks = storyNeighbors.slice(0, 8).map((edge) => collaborationItem(edge, id)).join("");
      // Compose depends_on / Kubernetes selector needs are owned by Container/Workload.
      const otherLinks = importsAndCalls
        .filter((edge) => {
          if (edge.kind !== "depends-on") return true;
          const otherId = edge.source === id ? edge.target : edge.source;
          const other = byId.get(otherId);
          if (!(other && other.kind === "service")) return true;
          if (node.metadata && node.metadata.docker && other.metadata && other.metadata.docker) {
            return false;
          }
          if (
            node.metadata &&
            node.metadata.kubernetes &&
            other.metadata &&
            other.metadata.kubernetes
          ) {
            return false;
          }
          if (
            node.metadata &&
            node.metadata.helm &&
            other.metadata &&
            other.metadata.helm
          ) {
            return false;
          }
          return true;
        })
        .slice(0, 20)
        .map((edge) => connectionButton(edge, id))
        .join("");
      // "In the story" leads the panel; Imports & calls stay secondary.
      const collaborationHtml = collabLinks
        ? "<h3>In the story</h3>" + collabLinks
        : "";
      const structuredSections = httpEndpoint || scheduledWork || deployUnit || containerStory || workloadStory || chartStory || overlayStory || tableSources || tableRelations || messaging || collabLinks;
      const otherHtml = otherLinks
        ? "<h3>" + (collabLinks ? "Imports &amp; calls" : "Connections") + "</h3>" + otherLinks
        : (structuredSections ? "" : "<h3>Connections</h3><p>None visible</p>");
      const keyFileList = Array.isArray(node.metadata && node.metadata.keyFiles) ? node.metadata.keyFiles : [];
      const keyFiles = keyFileList.length
        ? "<h3>Key files</h3>" + keyFileList.map((file) => {
            const href = "vscode://file/" + graph.project.root.replace(/\\/$/, "") + "/" + file;
            return '<div class="evidence"><a href="' + href + '">' + file + "</a></div>";
          }).join("")
        : "";
      const binCommands = Array.isArray(node.metadata && node.metadata.binCommands) ? node.metadata.binCommands : [];
      const binHtml = binCommands.length
        ? "<h3>Package bin</h3><p>" + binCommands.map((command) => '<span class="pill">' + command + "</span>").join("") + "</p>"
        : "";
      const extractorRoster = Array.isArray(node.metadata && node.metadata.extractorRoster) ? node.metadata.extractorRoster : [];
      const adapterRoster = Array.isArray(node.metadata && node.metadata.adapterRoster) ? node.metadata.adapterRoster : [];
      const capabilityRoster = extractorRoster.length ? extractorRoster : adapterRoster;
      const rosterHtml = capabilityRoster.length
        ? "<h3>Capabilities</h3><p>" + capabilityRoster.map((name) => '<span class="pill">' + name + "</span>").join("") + "</p>"
        : "";
      const surfaceKids = (outgoing.get(id) || [])
        .filter((edge) => edge.kind === "contains")
        .map((edge) => byId.get(edge.target))
        .filter((child) => child && isDetectionSurface(child));
      const capabilityHtml =
        node.kind === "capability" && surfaceKids.length
          ? "<h3>Detects</h3><p>" +
            surfaceKids
              .map((child) => {
                const detail = child.metadata && child.metadata.detail
                  ? " — " + child.metadata.detail
                  : "";
                return '<span class="pill">' + child.label + "</span>" +
                  (detail
                    ? '<div class="evidence"><p>' + escapeHtml(child.label + detail) + "</p></div>"
                    : "");
              })
              .join("") +
            "</p>"
          : "";
      const surfaceHtml =
        isDetectionSurface(node) && node.metadata && node.metadata.detail
          ? "<h3>Detection surface</h3><p>" + escapeHtml(String(node.metadata.detail)) + "</p>"
          : "";
      const evidenceItems = Array.isArray(node.evidence) ? node.evidence : [];
      const evidence = evidenceItems.map((item) => {
        const line = item.range?.startLine || 1;
        const href = "vscode://file/" + graph.project.root.replace(/\\/$/, "") + "/" + item.file + ":" + line;
        return '<div class="evidence"><a href="' + href + '">' + item.file + ":" + line + '</a><div class="certainty ' + item.certainty + '">' + item.certainty + " · " + item.extractor + "</div>" + (item.detail ? "<p>" + item.detail + "</p>" : "") + "</div>";
      }).join("");
      const evidenceHtml = evidence
        ? "<h3>Evidence</h3>" + evidence
        : "<h3>Evidence</h3><p>No file evidence</p>";
      const moreHtml = metadata
        ? '<div class="inspector-more"><h3>More</h3>' + metadata + "</div>"
        : "";
      const roleHtml =
        '<p class="inspector-role">' + escapeHtml(plainLanguageRole(node)) + "</p>";
      // Story-first panel: role → story neighbors → evidence → secondary sections.
      // Never lead with kind·semantic or projection/systemKey/flowOrder pills.
      inspector.innerHTML =
        "<h2></h2>" +
        roleHtml +
        kindCluster +
        httpEndpoint +
        scheduledWork +
        dataResource +
        deployUnit +
        collaborationHtml +
        evidenceHtml +
        surfaceHtml +
        capabilityHtml +
        containerStory +
        workloadStory +
        chartStory +
        overlayStory +
        tableSources +
        tableRelations +
        messaging +
        binHtml +
        rosterHtml +
        keyFiles +
        otherHtml +
        moreHtml;
      inspector.querySelector("h2").textContent = node.label;
      inspector.querySelectorAll(".connection").forEach((button) => {
        button.onclick = () => selectNode(button.dataset.id);
      });
      openInspector();
      render();
    }

    // Mirrors src/projection/clusterWalk.ts — keep in sync.
    function isClusterWalkHub(node) {
      return !!(
        node &&
        node.metadata &&
        (node.metadata.routeGroup === true || node.metadata.kindCluster === true)
      );
    }
    function isClusterWalkFrame(node) {
      if (!node || node.kind === "product") return false;
      if (node.kind === "api" || (node.metadata && node.metadata.systemKey === "api")) {
        return true;
      }
      return isClusterWalkHub(node);
    }
    function clusterWalkAncestors(focusId) {
      const frames = [];
      const seen = new Set([focusId]);
      let current = byId.get(focusId);
      while (current) {
        const parentId = current.parentId;
        if (!parentId || seen.has(parentId)) break;
        seen.add(parentId);
        const parent = byId.get(parentId);
        if (!parent || parent.kind === "product") break;
        if (isClusterWalkFrame(parent)) frames.unshift(parent.id);
        current = parent;
      }
      return frames;
    }

    function focusNode(id) {
      // Dead-end Intermediate leaves (e.g. extractor services with no children)
      // escalate via resolveWalkFocus to the parent system at Advanced.
      const walk = resolveWalkFocus(id);
      const focused = byId.get(walk.focusId);
      // Cluster hubs are their own frames. Seed API → Articles so Find
      // "Comments" cannot dump the user at a nested room with no way
      // back except Overview (H2).
      if (isClusterWalkHub(focused)) {
        state.history = clusterWalkAncestors(walk.focusId);
      } else {
        const prevFocus = state.focus;
        if (prevFocus && prevFocus !== walk.focusId) {
          state.history.push(prevFocus);
        }
      }
      state.focus = walk.focusId;
      state.tier = walk.tier;
      syncTierButton();
      resetCamera();
      // Must refresh inspector — setting selected alone left Beginner empty copy.
      selectNode(walk.selectedId);
      fitToView();
      persistWalkState();
    }

    document.getElementById("overview").onclick = () => goOverview();
    document.getElementById("analysis-button").onclick = () => showAnalysis();
    document.getElementById("inspector-close").onclick = () => closeInspector();
    document.getElementById("back").onclick = () => {
      goBack();
    };
    document.getElementById("zoom-out").onclick = () => zoomBy(1 / 1.2);
    document.getElementById("zoom-in").onclick = () => zoomBy(1.2);
    document.getElementById("fit-view").onclick = () => fitToView();
    document.getElementById("reset-layout").onclick = () => {
      clearManualLayouts();
      render();
      fitToView();
    };
    document.addEventListener("keydown", handleEscapeKey);
    document.getElementById("tier").onclick = () => {
      // View only deepens inside a focus — without one, Intermediate/Advanced
      // used to look identical to Beginner (calm overview) and felt broken.
      if (!state.focus) {
        state.tier = "beginner";
        syncTierButton();
        const walkHint = document.getElementById("walk-hint");
        if (walkHint) {
          walkHint.textContent =
            "Double-click a Product Flow system to walk in — View deepens inside a focus";
        }
        if (!state.selected) inspector.innerHTML = emptyInspectorHtml();
        render();
        fitToView();
        persistWalkState();
        return;
      }
      // With focus: Intermediate ↔ Advanced (Beginner via Overview / Back / Esc).
      state.tier = state.tier === "advanced" ? "intermediate" : "advanced";
      syncTierButton();
      if (!state.selected) inspector.innerHTML = emptyInspectorHtml();
      render();
      fitToView();
      persistWalkState();
    };
    search.oninput = () => {
      renderSearchResults();
    };
    search.onkeydown = handleSearchKeydown;
    search.addEventListener("focus", renderSearchResults);
    viewport.onclick = (event) => {
      if (event.target.closest("#canvas-tools")) return;
      if (state.suppressCanvasClick) {
        state.suppressCanvasClick = false;
        return;
      }
      state.selected = null;
      inspector.innerHTML = emptyInspectorHtml();
      render();
      persistWalkState();
    };
    viewport.onwheel = (event) => {
      event.preventDefault();
      const next = Math.min(
        MAX_SCALE,
        Math.max(
          Math.min(MIN_SCALE, state.scale),
          state.scale * (event.deltaY > 0 ? .9 : 1.1),
        ),
      );
      const rect = viewport.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      state.x = mx - ((mx - state.x) / state.scale) * next;
      state.y = my - ((my - state.y) / state.scale) * next;
      state.scale = next;
      applyTransform();
    };
    viewport.onpointerdown = (event) => {
      if (event.target.closest(".node, button, input, a")) return;
      state.dragging = true;
      state.startX = event.clientX - state.x;
      state.startY = event.clientY - state.y;
      viewport.classList.add("dragging");
      viewport.setPointerCapture(event.pointerId);
    };
    viewport.onpointermove = (event) => {
      if (state.nodeDrag) {
        const rect = viewport.getBoundingClientRect();
        const worldX = (event.clientX - rect.left - state.x) / state.scale;
        const worldY = (event.clientY - rect.top - state.y) / state.scale;
        const distance = Math.hypot(
          event.clientX - state.nodeDrag.startClientX,
          event.clientY - state.nodeDrag.startClientY,
        );
        if (distance > 3 && !state.nodeDrag.moved) {
          state.nodeDrag.moved = true;
          viewport.setPointerCapture(event.pointerId);
        }
        if (!state.nodeDrag.moved) return;
        setManualPosition(
          state.nodeDrag.id,
          Math.max(0, worldX - state.nodeDrag.offsetX),
          Math.max(0, worldY - state.nodeDrag.offsetY),
        );
        if (state.nodeDragFrame === null) {
          state.nodeDragFrame = requestAnimationFrame(() => {
            state.nodeDragFrame = null;
            if (!state.nodeDrag) return;
            const position = manualPositionFor(state.nodeDrag.id);
            if (position) {
              rerouteDraggedNode(state.nodeDrag.id, position.x, position.y);
            }
          });
        }
        return;
      }
      if (!state.dragging) return;
      state.x = event.clientX - state.startX;
      state.y = event.clientY - state.startY;
      applyTransform();
    };
    viewport.onpointerup = (event) => {
      if (state.nodeDrag) {
        const dragged = state.nodeDrag;
        if (dragged.moved) {
          if (state.nodeDragFrame !== null) {
            cancelAnimationFrame(state.nodeDragFrame);
            state.nodeDragFrame = null;
          }
          const position = manualPositionFor(dragged.id);
          if (position) rerouteDraggedNode(dragged.id, position.x, position.y);
          const element = nodeElementsScratch.get(dragged.id);
          if (element) element.classList.remove("dragging");
          state.suppressNodeClick = dragged.id;
          state.suppressCanvasClick = true;
          persistManualLayouts();
          setTimeout(() => {
            if (state.suppressNodeClick === dragged.id) state.suppressNodeClick = null;
            state.suppressCanvasClick = false;
          }, 0);
        }
        state.nodeDrag = null;
        if (viewport.hasPointerCapture(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId);
        }
        return;
      }
      state.dragging = false;
      viewport.classList.remove("dragging");
    };
    viewport.onpointercancel = viewport.onpointerup;

    // Hydrate last walk before first paint (stale ids → Beginner overview).
    restoreManualLayouts();
    restoreWalkState();
    syncTierButton();
    syncAnalysisButton(false);
    if (state.selected && byId.has(state.selected)) {
      selectNode(state.selected);
    } else {
      inspector.innerHTML = emptyInspectorHtml();
      render();
    }
    fitToView();
  </script>
</body>
</html>`;
}
