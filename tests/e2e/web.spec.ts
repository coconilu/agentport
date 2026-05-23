import { test, expect } from "@playwright/test";
import { createE2EFixture, type E2EFixture } from "./helpers.js";

let fx: E2EFixture;

test.beforeAll(async () => {
  fx = await createE2EFixture();
});

test.afterAll(async () => {
  await fx?.close();
});

test("E1: page loads with header and meta", async ({ page }) => {
  await page.goto(fx.url);
  await expect(page.locator("h1")).toHaveText("agentport");
  await expect(page.locator("#meta")).toContainText("Last scan");
});

test("E2: by-tool view shows 3 tool tabs with counts", async ({ page }) => {
  await page.goto(fx.url);
  // Wait for snapshot to render
  await expect(page.locator('[data-testid="tab-tool-claude-code"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-tool-opencode"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-tool-codex"]')).toBeVisible();
  // Each tab has a count badge
  const counts = await page.locator(".tabs .count").allTextContents();
  expect(counts.length).toBeGreaterThanOrEqual(3);
});

test("E3: switching to by-type changes tabs to type names", async ({ page }) => {
  await page.goto(fx.url);
  await page.locator('[data-testid="view-by-type"]').click();
  await expect(page.locator('[data-testid="tab-type-mcpServers"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-type-skills"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-type-agents"]')).toBeVisible();
  // Tool tabs should be gone
  await expect(page.locator('[data-testid="tab-tool-claude-code"]')).toHaveCount(0);
});

test("E4: clicking a card expands it to show details", async ({ page }) => {
  await page.goto(fx.url);
  // Wait for cards to render in claude-code tool tab
  const card = page.locator('[data-testid="card-agent:claude-code:code-reviewer"]').first();
  await expect(card).toBeVisible();
  await expect(card).not.toHaveClass(/expanded/);
  await card.click();
  await expect(card).toHaveClass(/expanded/);
  // Expanded view shows the tools list
  await expect(card.locator(".expandable")).toContainText("Read");
  await expect(card.locator(".expandable")).toContainText("Grep");
  // Click again to collapse
  await card.click();
  await expect(card).not.toHaveClass(/expanded/);
});

test("E5: refresh button re-fetches snapshot and updates meta timestamp", async ({ page }) => {
  await page.goto(fx.url);
  const meta = page.locator("#meta");
  const before = (await meta.textContent())!;
  // Wait at least 1 second so timestamp display will differ (resolution = seconds)
  await page.waitForTimeout(1100);
  await page.locator('[data-testid="refresh"]').click();
  // Refresh button shows loading state briefly — wait for it to settle
  await expect(page.locator('[data-testid="refresh"]')).not.toHaveClass(/loading/);
  const after = (await meta.textContent())!;
  expect(after).not.toBe(before);
});

test("E6: MCP card shows transport badge and env count", async ({ page }) => {
  await page.goto(fx.url);
  const card = page.locator('[data-testid="card-mcp:claude-code:filesystem"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".badge.transport")).toContainText("stdio");
  await expect(card).toContainText("1 env");
});

test("E7: skill card shows file count + version badge", async ({ page }) => {
  await page.goto(fx.url);
  const card = page.locator('[data-testid="card-skill:claude-code:my-skill"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("Useful skill");
  await expect(card).toContainText("file");
  await expect(card.locator(".badge.transport")).toContainText("v0.1.0");
});
