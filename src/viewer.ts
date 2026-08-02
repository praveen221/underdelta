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
    .node { position: absolute; width: 190px; min-height: 58px; background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 9px 10px; cursor: pointer; user-select: none; transition: opacity .12s, border-color .12s, background .12s; }
    .node:hover, .node.selected { border-color: var(--accent); background: #1c2230; }
    .node.dim { opacity: .16; }
    .node .top { display: flex; align-items: center; gap: 8px; }
    .node .glyph { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; border-radius: 6px; background: #252b35; color: var(--accent); font-weight: 800; font-size: 10px; text-transform: uppercase; }
    .node .label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 650; }
    .node .kind { color: var(--muted); font-size: 11px; margin: 5px 0 0 32px; }
    .node[data-kind="database"], .node[data-kind="table"], .node[data-kind="collection"] { border-color: #315942; }
    .node[data-kind="route"], .node[data-kind="api"] { border-color: #334f75; }
    .node[data-kind="cron"], .node[data-kind="job"], .node[data-kind="queue"], .node[data-kind="pipeline"] { border-color: #66522c; }
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
      <button id="implementation">Implementation: off</button>
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
      { name: "Experience", kinds: ["ui", "page", "component", "hook"] },
      { name: "Application", kinds: ["api", "route", "service", "module"] },
      { name: "Data & automation", kinds: ["database", "schema", "table", "collection", "cron", "job", "queue", "topic", "pipeline", "pipeline-step"] },
      { name: "External", kinds: ["external", "config", "unknown"] },
      { name: "Implementation", kinds: ["function", "column"] }
    ];
    const hiddenByDefault = new Set(["function", "column"]);
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
        if (node.kind === "product") return false;
        if (query && !(node.label + " " + node.kind + " " + (node.qualifiedName || "")).toLowerCase().includes(query)) return false;
        return true;
      });
    }

    function certaintyOf(item) {
      if (item.evidence.some((entry) => entry.certainty === "inferred")) return "inferred";
      if (item.evidence.some((entry) => entry.certainty === "derived")) return "derived";
      return "observed";
    }

    function render() {
      const visible = visibleNodes();
      const visibleIds = new Set(visible.map((node) => node.id));
      const positions = new Map();
      nodesLayer.innerHTML = "";
      const activeLanes = lanes.filter((lane) => state.implementation || lane.name !== "Implementation");
      const laneWidth = 240;
      let maxHeight = 0;

      activeLanes.forEach((lane, laneIndex) => {
        const laneNodes = visible.filter((node) => lane.kinds.includes(node.kind));
        if (!laneNodes.length) return;
        const label = document.createElement("div");
        label.className = "lane-label";
        label.textContent = lane.name;
        label.style.left = (laneIndex * laneWidth) + "px";
        label.style.top = "0px";
        nodesLayer.appendChild(label);
        laneNodes.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
        laneNodes.forEach((node, index) => {
          const x = laneIndex * laneWidth;
          const y = 34 + index * 78;
          positions.set(node.id, { x, y });
          maxHeight = Math.max(maxHeight, y + 70);
          const element = document.createElement("div");
          element.className = "node" + (state.selected === node.id ? " selected" : "");
          element.dataset.kind = node.kind;
          element.dataset.id = node.id;
          element.style.left = x + "px";
          element.style.top = y + "px";
          element.innerHTML = '<div class="top"><span class="glyph">' + node.kind.slice(0, 2) + '</span><span class="label"></span></div><div class="kind">' + node.kind + (node.technology ? " · " + node.technology : "") + "</div>";
          element.querySelector(".label").textContent = node.label;
          element.onclick = (event) => { event.stopPropagation(); selectNode(node.id); };
          element.ondblclick = (event) => { event.stopPropagation(); focusNode(node.id); };
          nodesLayer.appendChild(element);
        });
      });

      edgesLayer.innerHTML = "";
      edgesLayer.setAttribute("width", String(activeLanes.length * laneWidth + 200));
      edgesLayer.setAttribute("height", String(maxHeight + 100));
      for (const edge of graph.edges) {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const sx = source.x + 190;
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

    function selectNode(id) {
      state.selected = id;
      const node = byId.get(id);
      if (!node) return;
      const incomingEdges = incoming.get(id) || [];
      const outgoingEdges = outgoing.get(id) || [];
      const connections = [...incomingEdges, ...outgoingEdges];
      const metadata = Object.entries(node.metadata || {}).map(([key, value]) => '<span class="pill">' + key + ": " + String(value) + "</span>").join("");
      const links = connections.slice(0, 20).map((edge) => {
        const other = byId.get(edge.source === id ? edge.target : edge.source);
        return '<button class="pill connection" data-id="' + (other?.id || "") + '">' + edge.kind + " · " + (other?.label || "unknown") + "</button>";
      }).join("");
      const evidence = node.evidence.map((item) => {
        const line = item.range?.startLine || 1;
        const href = "vscode://file/" + graph.project.root.replace(/\\/$/, "") + "/" + item.file + ":" + line;
        return '<div class="evidence"><a href="' + href + '">' + item.file + ":" + line + '</a><div class="certainty ' + item.certainty + '">' + item.certainty + " · " + item.extractor + "</div>" + (item.detail ? "<p>" + item.detail + "</p>" : "") + "</div>";
      }).join("");
      inspector.innerHTML = "<h2></h2><p>" + node.kind + (node.technology ? " · " + node.technology : "") + "</p>" + metadata + "<h3>Connections</h3>" + (links || '<p>None visible</p>') + "<h3>Source evidence</h3>" + evidence;
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
      event.currentTarget.textContent = "Implementation: " + (state.implementation ? "on" : "off");
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
