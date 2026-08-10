import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { compileRepository } from "../../dist/compile.js";
import { renderArchitectureHtml } from "../../dist/viewer.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

let server;
let viewerUrl;
let largeViewerUrl;
let scheduledViewerUrl;
let scheduledRoot;

test.beforeAll(async () => {
  const graph = await compileRepository(repoRoot);
  const html = renderArchitectureHtml(graph);
  const largeGraph = {
    project: { name: "large-fit-contract", root: "/virtual/large-fit-contract" },
    nodes: Array.from({ length: 200 }, (_, index) => ({
      id: `system:large:${index}`,
      kind: "system",
      label: `System ${String(index + 1).padStart(3, "0")}`,
      metadata: { flowOrder: index },
      evidence: [],
    })),
    edges: [],
  };
  const largeHtml = renderArchitectureHtml(largeGraph);
  scheduledRoot = await mkdtemp(path.join(os.tmpdir(), "underdelta-scheduled-viewer-"));
  await Promise.all([
    mkdir(path.join(scheduledRoot, "src"), { recursive: true }),
    mkdir(path.join(scheduledRoot, "prisma"), { recursive: true }),
  ]);
  await writeFile(
    path.join(scheduledRoot, "package.json"),
    JSON.stringify({ name: "scheduled-viewer", dependencies: { "node-cron": "latest" } }),
    "utf8",
  );
  await writeFile(
    path.join(scheduledRoot, "src/jobs.ts"),
    [
      'import cron from "node-cron";',
      "export function sendDigest() {}",
      'cron.schedule("0 * * * *", sendDigest, { timezone: "UTC" });',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(scheduledRoot, "prisma/schema.prisma"),
    "model Note {\n  id Int @id\n  title String\n}\n",
    "utf8",
  );
  await writeFile(
    path.join(scheduledRoot, "docker-compose.yml"),
    [
      "services:",
      "  api:",
      "    image: example/api:1",
      "    ports:",
      '      - "8080:80"',
      "",
    ].join("\n"),
    "utf8",
  );
  const scheduledHtml = renderArchitectureHtml(
    await compileRepository(scheduledRoot),
  );
  server = createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      request.url === "/large"
        ? largeHtml
        : request.url === "/scheduled"
          ? scheduledHtml
          : html,
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  viewerUrl = `http://127.0.0.1:${address.port}/`;
  largeViewerUrl = `http://127.0.0.1:${address.port}/large`;
  scheduledViewerUrl = `http://127.0.0.1:${address.port}/scheduled`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (scheduledRoot) await rm(scheduledRoot, { recursive: true, force: true });
});

function node(page, label) {
  return page.locator(".node", { has: page.locator(".label", { hasText: label }) });
}

async function graphGeometry(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector("#viewport").getBoundingClientRect();
    const chrome = document.querySelector("#canvas-chrome").getBoundingClientRect();
    const tools = document.querySelector("#canvas-tools").getBoundingClientRect();
    const nodes = [...document.querySelectorAll(".node")].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    return {
      viewport: {
        left: viewport.left,
        right: viewport.right,
        top: viewport.top,
        bottom: viewport.bottom,
      },
      chromeTop: chrome.top,
      toolsLeft: tools.left,
      nodes,
    };
  });
}

function overlappingNodePairs(nodes) {
  const overlaps = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      if (
        left.left < right.right - 1 &&
        left.right > right.left + 1 &&
        left.top < right.bottom - 1 &&
        left.bottom > right.top + 1
      ) {
        overlaps.push([left.id, right.id]);
      }
    }
  }
  return overlaps;
}

test("self-map viewer supports a calm walk through focus, search, back, and reload", async ({ page }) => {
  await page.goto(viewerUrl);
  await expect(page.locator("#tier")).toHaveText("View: Beginner");
  await expect(node(page, "Extractors")).toBeVisible();
  await expect(page.locator('.node[data-kind="function"]')).toHaveCount(0);

  await node(page, "Extractors").dblclick();
  await expect(page.locator("#tier")).toHaveText("View: Intermediate");
  await expect(page.locator("#walk-hint")).toContainText("Extractors");

  await page.locator("#tier").click();
  await expect(page.locator("#tier")).toHaveText("View: Advanced · code in focus");
  await expect(node(page, "src/extractors/typescript.ts")).toBeVisible();
  await expect(node(page, "src/viewer.ts")).toHaveCount(0);

  await node(page, "src/extractors/typescript.ts").click();
  await expect(page.locator("#inspector h2")).toHaveText("src/extractors/typescript.ts");
  await page.keyboard.press("Escape");
  await expect(page.locator("#tier")).toHaveText("View: Intermediate");
  await expect(node(page, "src/extractors/typescript.ts")).toHaveCount(0);
  await expect(page.locator("#inspector h2")).toHaveText("Extractors");
  await expect(node(page, "Extractors")).toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#tier")).toHaveText("View: Beginner");

  await page.locator("#search").fill("src/extractors/typescript.ts");
  await expect(page.locator("#search-results button").first()).toBeVisible();
  await page.locator("#search").press("Enter");
  await expect(page.locator("#tier")).not.toHaveText("View: Beginner");
  await expect(node(page, "src/extractors/typescript.ts")).toBeVisible();

  await page.reload();
  await expect(page.locator("#tier")).not.toHaveText("View: Beginner");
  await expect(node(page, "src/extractors/typescript.ts")).toBeVisible();
});

test("graph geometry fits, reroutes dragged nodes, and persists manual placement", async ({ page }) => {
  await page.goto(viewerUrl);

  const beginnerGeometry = await graphGeometry(page);
  assert.deepEqual(overlappingNodePairs(beginnerGeometry.nodes), []);
  for (const item of beginnerGeometry.nodes) {
    assert.ok(item.left >= beginnerGeometry.viewport.left - 1, `${item.id} starts outside the viewport`);
    assert.ok(item.right <= beginnerGeometry.toolsLeft - 1, `${item.id} is covered by graph controls`);
    assert.ok(item.top >= beginnerGeometry.viewport.top - 1, `${item.id} starts above the viewport`);
    assert.ok(item.bottom <= beginnerGeometry.chromeTop - 1, `${item.id} is covered by canvas chrome`);
  }

  const beginnerEdges = await page.locator("#edges path.edge").count();
  await expect(page.locator("#counts")).toContainText(`${beginnerEdges} visible relationships`);
  const incompleteEdges = await page.locator("#edges path.edge").evaluateAll((paths) =>
    paths
      .filter((path) =>
        !path.dataset.source ||
        !path.dataset.target ||
        !path.getAttribute("marker-end"))
      .map((path) => path.dataset.kind),
  );
  assert.deepEqual(incompleteEdges, []);

  await node(page, "Extractors").dblclick();
  await page.locator("#tier").click();
  const module = node(page, "src/extractor.ts");
  const moduleId = await module.getAttribute("data-id");
  assert.ok(moduleId);

  const incidentPathSelector = `#edges path.edge[data-source="${moduleId}"], #edges path.edge[data-target="${moduleId}"]`;
  const incidentPaths = page.locator(incidentPathSelector);
  assert.ok(await incidentPaths.count() > 0, "expected the module to have rendered incident edges");
  const beforePath = await incidentPaths.first().getAttribute("d");
  const beforePosition = await module.evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
    rect: element.getBoundingClientRect().toJSON(),
  }));
  await module.evaluate((element) => {
    element.dataset.dragIdentity = "preserved";
  });

  await page.mouse.move(
    beforePosition.rect.x + beforePosition.rect.width / 2,
    beforePosition.rect.y + beforePosition.rect.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    beforePosition.rect.x + beforePosition.rect.width / 2 + 120,
    beforePosition.rect.y + beforePosition.rect.height / 2 + 70,
    { steps: 5 },
  );
  await page.mouse.up();

  const afterPosition = await node(page, "src/extractor.ts").evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
  }));
  assert.notDeepEqual(afterPosition, {
    left: beforePosition.left,
    top: beforePosition.top,
  });
  await expect(node(page, "src/extractor.ts")).toHaveAttribute("data-drag-identity", "preserved");
  assert.notEqual(await page.locator(incidentPathSelector).first().getAttribute("d"), beforePath);

  await page.reload();
  await expect(page.locator("#tier")).toHaveText("View: Advanced · code in focus");
  const restoredPosition = await node(page, "src/extractor.ts").evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
  }));
  assert.deepEqual(restoredPosition, afterPosition);
  await expect(node(page, "src/extractor.ts")).toHaveAttribute("data-manual-position", "true");
  const selectedBeforeControls = await page.locator(".node.selected").getAttribute("data-id");
  assert.ok(selectedBeforeControls);
  const inspectorBeforeControls = await page.locator("#inspector h2").innerText();

  const transformBeforeZoom = await page.locator("#world").getAttribute("style");
  await page.locator("#zoom-in").click();
  await expect(page.locator(".node.selected")).toHaveAttribute("data-id", selectedBeforeControls);
  await expect(page.locator("#inspector h2")).toHaveText(inspectorBeforeControls);
  const transformAfterZoom = await page.locator("#world").getAttribute("style");
  assert.notEqual(transformAfterZoom, transformBeforeZoom);
  await page.locator("#fit-view").click();
  await expect(page.locator(".node.selected")).toHaveAttribute("data-id", selectedBeforeControls);
  await expect(page.locator("#inspector h2")).toHaveText(inspectorBeforeControls);
  assert.notEqual(await page.locator("#world").getAttribute("style"), transformAfterZoom);
  const fittedGeometry = await graphGeometry(page);
  for (const item of fittedGeometry.nodes) {
    assert.ok(item.left >= fittedGeometry.viewport.left - 1, `${item.id} starts outside fitted view`);
    assert.ok(item.right <= fittedGeometry.toolsLeft - 1, `${item.id} is covered by graph controls after fitting`);
    assert.ok(item.top >= fittedGeometry.viewport.top - 1, `${item.id} starts above fitted view`);
    assert.ok(item.bottom <= fittedGeometry.chromeTop - 1, `${item.id} is covered after fitting`);
  }

  await page.locator("#reset-layout").click();
  await expect(page.locator(".node.selected")).toHaveAttribute("data-id", selectedBeforeControls);
  await expect(page.locator("#inspector h2")).toHaveText(inspectorBeforeControls);
  await expect(node(page, "src/extractor.ts")).toHaveAttribute("data-manual-position", "false");
  const resetPosition = await node(page, "src/extractor.ts").evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
  }));
  assert.notDeepEqual(resetPosition, afterPosition);
});

test("fit frames graphs that require a scale below the interactive zoom floor", async ({ page }) => {
  await page.goto(largeViewerUrl);
  await expect(page.locator(".node")).toHaveCount(200);

  const scale = await page.locator("#world").evaluate((element) =>
    new DOMMatrix(getComputedStyle(element).transform).a,
  );
  assert.ok(scale < 0.15, `expected a true fit below 0.15, received ${scale}`);

  const geometry = await graphGeometry(page);
  for (const item of geometry.nodes) {
    assert.ok(item.left >= geometry.viewport.left - 1, `${item.id} starts outside large fitted view`);
    assert.ok(item.right <= geometry.toolsLeft - 1, `${item.id} is covered by controls in large fitted view`);
    assert.ok(item.top >= geometry.viewport.top - 1, `${item.id} starts above large fitted view`);
    assert.ok(item.bottom <= geometry.chromeTop - 1, `${item.id} is covered in large fitted view`);
  }
});

test("scheduled work walks from Beginner system to typed trigger and job details", async ({ page }) => {
  await page.goto(scheduledViewerUrl);
  await expect(page.locator("#tier")).toHaveText("View: Beginner");
  await expect(node(page, "Scheduled jobs")).toBeVisible();
  await expect(page.locator('.node[data-kind="cron"]')).toHaveCount(0);

  await node(page, "Scheduled jobs").dblclick();
  await expect(page.locator("#tier")).toHaveText("View: Intermediate");
  const trigger = page.locator('.node[data-kind="cron"]');
  const job = page.locator('.node[data-kind="job"]');
  await expect(trigger).toContainText("Send digest (every hour)");
  await expect(job).toContainText("Send digest");
  await expect(page.locator('#edges path.edge[data-kind="schedules"]')).toHaveCount(1);

  await trigger.click();
  await expect(page.locator("#inspector h2")).toHaveText("Send digest (every hour)");
  await expect(page.locator("#inspector")).toContainText("Expression: 0 * * * *");
  await expect(page.locator("#inspector")).toContainText("Timezone: UTC");
  await expect(page.locator("#inspector")).toContainText("Provider: node-cron");

  await job.click();
  await expect(page.locator("#inspector")).toContainText("Handler: sendDigest");
  await expect(page.locator("#inspector")).toContainText("Execution: in-process");
});

test("data resources expose their normalized contract in the inspector", async ({ page }) => {
  await page.goto(scheduledViewerUrl);
  await expect(node(page, "Data access")).toBeVisible();
  await expect(page.locator('.node[data-kind="table"]')).toHaveCount(0);

  await node(page, "Data access").dblclick();
  const table = page.locator('.node[data-kind="table"]', { hasText: "Note" });
  await expect(table).toBeVisible();
  await table.click();
  await expect(page.locator("#inspector")).toContainText("Data resource");
  await expect(page.locator("#inspector")).toContainText("Resource: table");
  await expect(page.locator("#inspector")).toContainText("Provider: prisma");
});

test("deploy units are walkable and expose normalized operational details", async ({ page }) => {
  await page.goto(scheduledViewerUrl);
  await expect(node(page, "Deploy")).toBeVisible();
  await expect(page.locator('.node[data-kind="service"]')).toHaveCount(0);

  await node(page, "Deploy").dblclick();
  const service = page.locator('.node[data-kind="service"]', { hasText: "API · 8080" });
  await expect(service).toBeVisible();
  await service.click();
  await expect(page.locator("#inspector .inspector-role")).toHaveText("Container");
  await expect(page.locator("#inspector")).toContainText("Deploy unit");
  await expect(page.locator("#inspector")).toContainText("Type: container");
  await expect(page.locator("#inspector")).toContainText("Provider: docker-compose");
  await expect(page.locator("#inspector")).toContainText("Image: example/api:1");
  await expect(page.locator("#inspector")).toContainText("Ports: 8080:80");
  await expect(page.locator("#inspector")).toContainText("docker-compose.yml");
});
