import type { ArchitectureGraph } from "./schema.js";

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderArchitectureHtml(graph: ArchitectureGraph): string {
  const title = graph.project.name.replaceAll(/[<>&"]/g, "");
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
    #search { width: min(340px, 30vw); margin-left: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 8px 10px; outline: none; }
    #search:focus { border-color: var(--accent); }
    #workspace { display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
    #viewport { position: relative; overflow: hidden; cursor: grab; }
    #viewport.dragging { cursor: grabbing; }
    #world { position: absolute; transform-origin: 0 0; width: 1px; height: 1px; }
    #edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
    .edge { stroke: #46505d; stroke-width: 1.2; fill: none; opacity: .48; }
    .edge.derived { stroke-dasharray: 5 4; stroke: var(--derived); }
    .edge.inferred { stroke-dasharray: 2 5; stroke: var(--inferred); }
    .edge.active { stroke: var(--accent); stroke-width: 2.3; opacity: .95; }
    #nodes { position: absolute; inset: 0; }
    .lane-label { position: absolute; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
    .node { --kind-color: #77808d; position: absolute; width: 190px; min-height: 58px; background: var(--panel); border: 1px solid var(--kind-color); border-radius: 9px; padding: 9px 10px; cursor: pointer; user-select: none; transition: opacity .12s, border-color .12s, background .12s; }
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
    aside h2 { margin: 0 0 4px; font-size: 17px; }
    aside h3 { margin: 20px 0 8px; color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    aside p { color: var(--muted); margin: 4px 0 12px; overflow-wrap: anywhere; }
    .pill { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; margin: 2px 4px 2px 0; font-size: 11px; color: var(--muted); }
    .evidence { border-top: 1px solid var(--line); padding: 9px 0; }
    .evidence a { color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
    .evidence a:hover { color: var(--accent); }
    .certainty { font-size: 10px; text-transform: uppercase; margin-top: 3px; }
    .certainty.observed { color: var(--observed); }
    .certainty.derived { color: var(--derived); }
    .certainty.inferred { color: var(--inferred); }
    .empty { color: var(--muted); padding-top: 30px; text-align: center; }
    #legend { position: absolute; left: 14px; bottom: 14px; display: flex; gap: 10px; color: var(--muted); background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; pointer-events: none; }
    #legend span::before { content: ""; display: inline-block; width: 14px; border-top: 2px solid var(--observed); margin-right: 5px; vertical-align: middle; }
    #legend .derived::before { border-color: var(--derived); border-top-style: dashed; }
    #legend .inferred::before { border-color: var(--inferred); border-top-style: dotted; }
    @media (max-width: 760px) {
      #workspace { grid-template-columns: 1fr; }
      aside { display: none; }
      header .meta { display: none; }
    }
  </style>
</head>
<body>
  <div id="shell">
    <header>
      <strong>${title}</strong>
      <span class="meta" id="counts"></span>
      <button id="back" hidden>Back</button>
      <button id="overview">Overview</button>
      <button id="implementation">Details: off</button>
      <input id="search" type="search" placeholder="Find a route, table, job, component…" />
    </header>
    <div id="workspace">
      <main id="viewport">
        <div id="world">
          <svg id="edges"></svg>
          <div id="nodes"></div>
        </div>
        <div id="legend"><span>observed</span><span class="derived">derived</span><span class="inferred">inferred</span></div>
      </main>
      <aside id="inspector"><div class="empty">Select a component to inspect its connections and source evidence.</div></aside>
    </div>
  </div>
  <script>
    const graph = ${safeJson(graph)};
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
      { name: "Systems", kinds: ["system", "api", "service", "pipeline"] },
      { name: "Experience", kinds: ["ui", "page", "component", "hook"] },
      { name: "Application", kinds: ["route"] },
      { name: "Data & automation", kinds: ["database", "schema", "table", "collection", "cron", "job", "queue", "topic", "pipeline-step"] },
      { name: "External", kinds: ["external", "config", "unknown"] },
      { name: "Details", kinds: ["module", "function", "column", "pipeline-step"] }
    ];
    // Default view prefers product systems over raw modules/functions/steps.
    const hiddenByDefault = new Set(["function", "column", "module", "pipeline-step"]);
    const state = { scale: 1, x: 36, y: 40, dragging: false, startX: 0, startY: 0, focus: null, selected: null, implementation: false, history: [] };
    const viewport = document.getElementById("viewport");
    const world = document.getElementById("world");
    const nodesLayer = document.getElementById("nodes");
    const edgesLayer = document.getElementById("edges");
    const inspector = document.getElementById("inspector");
    const search = document.getElementById("search");

    function applyTransform() {
      world.style.transform = "translate(" + state.x + "px," + state.y + "px) scale(" + state.scale + ")";
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

    function visibleNodes() {
      let allowed = state.focus ? descendants(state.focus) : new Set(graph.nodes.map((node) => node.id));
      const query = search.value.trim().toLowerCase();
      return graph.nodes.filter((node) => {
        if (!allowed.has(node.id)) return false;
        if (!state.implementation && hiddenByDefault.has(node.kind)) return false;
        if (
          !state.implementation &&
          !state.focus &&
          !query &&
          node.metadata &&
          node.metadata.collapsedInOverview
        ) {
          return false;
        }
        if (node.kind === "product") return false;
        if (query && !(node.label + " " + node.kind + " " + (node.qualifiedName || "")).toLowerCase().includes(query)) return false;
        return true;
      });
    }

    function iconForKind(kind) {
      const paths = {
        module: '<path d="M3 6.5h6l2 2h10v10H3z"/><path d="M3 9h18"/>',
        system: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 5v14M14 5v14"/>',
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

    function widthForKind(kind) {
      if (kind === "function" || kind === "column") return 170;
      if (kind === "hook") return 176;
      return 190;
    }

    function flowOrderOf(node) {
      const value = node.metadata && node.metadata.flowOrder;
      return typeof value === "number" ? value : null;
    }

    function placeNode(node, x, y) {
      positionsScratch.set(node.id, { x, y, width: widthForKind(node.kind) });
      const element = document.createElement("div");
      element.className = "node" + (state.selected === node.id ? " selected" : "");
      element.dataset.kind = node.kind;
      element.dataset.id = node.id;
      if (node.metadata && node.metadata.role) element.dataset.role = node.metadata.role;
      element.style.left = x + "px";
      element.style.top = y + "px";
      element.innerHTML = '<div class="top"><span class="glyph">' + iconForKind(node.kind) + '</span><span class="label"></span></div><div class="kind">' + node.kind.replace("-", " ") + (node.technology ? " · " + node.technology : "") + "</div>";
      element.querySelector(".label").textContent = node.label;
      element.onclick = (event) => { event.stopPropagation(); selectNode(node.id); };
      element.ondblclick = (event) => { event.stopPropagation(); focusNode(node.id); };
      nodesLayer.appendChild(element);
      return y + 70;
    }

    let positionsScratch = new Map();

    function render() {
      const visible = visibleNodes();
      const visibleIds = new Set(visible.map((node) => node.id));
      positionsScratch = new Map();
      const positions = positionsScratch;
      nodesLayer.innerHTML = "";
      const activeLanes = lanes.filter((lane) => state.implementation || lane.name !== "Details");
      const laneWidth = 240;
      const flowGap = 220;
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
          const x = index * flowGap;
          const y = 34;
          placeNode(node, x, y);
          maxHeight = Math.max(maxHeight, y + 70);
          maxWidth = Math.max(maxWidth, x + widthForKind(node.kind) + 80);
        });
        laneTop = 130;
      }

      activeLanes.forEach((lane, laneIndex) => {
        const laneNodes = visible.filter((node) => lane.kinds.includes(node.kind) && !flowIds.has(node.id));
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
        laneNodes.forEach((node, index) => {
          const x = laneIndex * laneWidth;
          const y = laneTop + 34 + index * 78;
          placeNode(node, x, y);
          maxHeight = Math.max(maxHeight, y + 70);
        });
      });

      edgesLayer.innerHTML = "";
      edgesLayer.setAttribute("width", String(maxWidth));
      edgesLayer.setAttribute("height", String(maxHeight + 100));
      for (const edge of graph.edges) {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const sx = source.x + source.width;
        const sy = source.y + 29;
        const tx = target.x;
        const ty = target.y + 29;
        const bend = Math.max(35, Math.abs(tx - sx) * .45);
        path.setAttribute("d", "M " + sx + " " + sy + " C " + (sx + bend) + " " + sy + ", " + (tx - bend) + " " + ty + ", " + tx + " " + ty);
        path.setAttribute("class", "edge " + certaintyOf(edge) + ((state.selected === edge.source || state.selected === edge.target) ? " active" : ""));
        edgesLayer.appendChild(path);
      }
      highlightNeighborhood();
      document.getElementById("counts").textContent = visible.length + " components · " + graph.edges.length + " relationships";
      document.getElementById("back").hidden = state.history.length === 0;
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

    // Product-story edges surface before module imports in the inspector.
    const collaborationKinds = new Set([
      "uses", "renders", "exposes", "triggers", "configures", "flows-to",
    ]);

    function connectionButton(edge, id) {
      const other = byId.get(edge.source === id ? edge.target : edge.source);
      return '<button class="pill connection" data-id="' + (other?.id || "") + '">' + edge.kind + " · " + (other?.label || "unknown") + "</button>";
    }

    function selectNode(id) {
      state.selected = id;
      const node = byId.get(id);
      if (!node) return;
      const incomingEdges = incoming.get(id) || [];
      const outgoingEdges = outgoing.get(id) || [];
      const connections = [...incomingEdges, ...outgoingEdges];
      const collaboration = connections.filter((edge) => collaborationKinds.has(edge.kind));
      const importsAndCalls = connections.filter((edge) => !collaborationKinds.has(edge.kind));
      const metadataEntries = Object.entries(node.metadata || {}).filter(([key]) => key !== "keyFiles" && key !== "binEntries" && key !== "packageExports" && key !== "extractorRoster");
      const metadata = metadataEntries.map(([key, value]) => '<span class="pill">' + key + ": " + String(value) + "</span>").join("");
      const collabLinks = collaboration.slice(0, 16).map((edge) => connectionButton(edge, id)).join("");
      const otherLinks = importsAndCalls.slice(0, 20).map((edge) => connectionButton(edge, id)).join("");
      const collaborationHtml = collabLinks
        ? "<h3>Collaboration</h3>" + collabLinks
        : "";
      const otherHtml = otherLinks
        ? "<h3>" + (collabLinks ? "Imports &amp; calls" : "Connections") + "</h3>" + otherLinks
        : (collabLinks ? "" : "<h3>Connections</h3><p>None visible</p>");
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
      const rosterHtml = extractorRoster.length
        ? "<h3>Extractors</h3><p>" + extractorRoster.map((name) => '<span class="pill">' + name + "</span>").join("") + "</p>"
        : "";
      const evidence = node.evidence.map((item) => {
        const line = item.range?.startLine || 1;
        const href = "vscode://file/" + graph.project.root.replace(/\\/$/, "") + "/" + item.file + ":" + line;
        return '<div class="evidence"><a href="' + href + '">' + item.file + ":" + line + '</a><div class="certainty ' + item.certainty + '">' + item.certainty + " · " + item.extractor + "</div>" + (item.detail ? "<p>" + item.detail + "</p>" : "") + "</div>";
      }).join("");
      inspector.innerHTML = "<h2></h2><p>" + node.kind + (node.technology ? " · " + node.technology : "") + "</p>" + metadata + binHtml + rosterHtml + keyFiles + collaborationHtml + otherHtml + "<h3>Source evidence</h3>" + evidence;
      inspector.querySelector("h2").textContent = node.label;
      inspector.querySelectorAll(".connection").forEach((button) => {
        button.onclick = () => selectNode(button.dataset.id);
      });
      render();
    }

    function focusNode(id) {
      state.history.push(state.focus);
      state.focus = id;
      state.selected = id;
      state.x = 36;
      state.y = 40;
      state.scale = 1;
      render();
      applyTransform();
    }

    document.getElementById("overview").onclick = () => {
      state.focus = null;
      state.history = [];
      state.selected = null;
      state.x = 36; state.y = 40; state.scale = 1;
      inspector.innerHTML = '<div class="empty">Select a component to inspect its connections and source evidence.</div>';
      render(); applyTransform();
    };
    document.getElementById("back").onclick = () => {
      state.focus = state.history.pop() || null;
      state.selected = state.focus;
      render();
    };
    document.getElementById("implementation").onclick = (event) => {
      state.implementation = !state.implementation;
      event.currentTarget.textContent = "Details: " + (state.implementation ? "on" : "off");
      render();
    };
    search.oninput = render;
    viewport.onclick = () => {
      state.selected = null;
      inspector.innerHTML = '<div class="empty">Select a component to inspect its connections and source evidence.</div>';
      render();
    };
    viewport.onwheel = (event) => {
      event.preventDefault();
      const next = Math.min(2.4, Math.max(.35, state.scale * (event.deltaY > 0 ? .9 : 1.1)));
      const rect = viewport.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      state.x = mx - ((mx - state.x) / state.scale) * next;
      state.y = my - ((my - state.y) / state.scale) * next;
      state.scale = next;
      applyTransform();
    };
    viewport.onpointerdown = (event) => {
      if (event.target.closest(".node")) return;
      state.dragging = true;
      state.startX = event.clientX - state.x;
      state.startY = event.clientY - state.y;
      viewport.classList.add("dragging");
      viewport.setPointerCapture(event.pointerId);
    };
    viewport.onpointermove = (event) => {
      if (!state.dragging) return;
      state.x = event.clientX - state.startX;
      state.y = event.clientY - state.startY;
      applyTransform();
    };
    viewport.onpointerup = () => {
      state.dragging = false;
      viewport.classList.remove("dragging");
    };

    render();
    applyTransform();
  </script>
</body>
</html>`;
}
