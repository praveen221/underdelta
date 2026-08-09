import assert from "node:assert/strict";
import { createServer } from "node:http";
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

test.beforeAll(async () => {
  const graph = await compileRepository(repoRoot);
  const html = renderArchitectureHtml(graph);
  server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  viewerUrl = `http://127.0.0.1:${address.port}/`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function node(page, label) {
  return page.locator(".node", { has: page.locator(".label", { hasText: label }) });
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

  await page.keyboard.press("Escape");
  await expect(page.locator("#tier")).toHaveText("View: Intermediate");
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
