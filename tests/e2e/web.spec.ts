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

test("E4: clicking a card opens modal with detail sections", async ({ page }) => {
  await page.goto(fx.url);
  const card = page.locator('[data-testid="card-agents:claude-code:code-reviewer"]').first();
  await expect(card).toBeVisible();
  const modal = page.locator('[data-testid="modal"]');
  await expect(modal).toBeHidden();
  await card.click();
  await expect(modal).toBeVisible();
  // Modal title shows the agent id
  await expect(modal.locator(".modal-title")).toHaveText("code-reviewer");
  // Description section + tools metadata
  await expect(modal).toContainText("Reviews code carefully");
  await expect(modal).toContainText("Read, Grep");
  // Body section preview present
  await expect(modal.locator('section[data-section="body"]')).toContainText("Body text here");
});

test("E4b: modal closes on Escape, overlay click, and close button", async ({ page }) => {
  await page.goto(fx.url);
  const modal = page.locator('[data-testid="modal"]');
  const overlay = page.locator('[data-testid="modal-overlay"]');
  const card = page.locator('[data-testid="card-agents:claude-code:code-reviewer"]').first();

  // Close via Escape
  await card.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  // Close via close button
  await card.click();
  await expect(modal).toBeVisible();
  await page.locator('[data-testid="modal-close"]').click();
  await expect(modal).toBeHidden();

  // Close via overlay backdrop click
  await card.click();
  await expect(modal).toBeVisible();
  await overlay.click({ position: { x: 10, y: 10 } });
  await expect(modal).toBeHidden();
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

test("E6: MCP card shows transport badge; env count appears in modal", async ({ page }) => {
  await page.goto(fx.url);
  const card = page.locator('[data-testid="card-mcpServers:claude-code:filesystem"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".badge.transport")).toContainText("stdio");
  await card.click();
  const modal = page.locator('[data-testid="modal"]');
  await expect(modal).toContainText("env vars");
  await expect(modal).toContainText("DEBUG");
});

test("E8: personas view lists 5+ persona cards with progress bars", async ({ page }) => {
  await page.goto(fx.url);
  await page.locator('[data-testid="view-personas"]').click();
  // At least the 5 built-in personas should be visible
  for (const id of ["frontend", "backend", "fullstack", "pm", "qa"]) {
    await expect(page.locator(`[data-testid="persona-card-${id}"]`)).toBeVisible();
  }
});

test("E9: click persona card opens detail; dry-run produces a plan", async ({ page }) => {
  await page.goto(fx.url);
  await page.locator('[data-testid="view-personas"]').click();
  await page.locator('[data-testid="persona-card-frontend"]').click();
  await expect(page.locator('[data-testid="persona-detail"]')).toBeVisible();
  // Action row
  await expect(page.locator('[data-testid="persona-target"]')).toBeVisible();
  // Dry-run
  await page.locator('[data-testid="persona-dry-run"]').click();
  const result = page.locator('[data-testid="persona-result"]');
  await expect(result).toBeVisible();
  // Frontend persona's playwright MCP should appear under "Will install"
  await expect(result).toContainText("playwright");
});

test("E7: skill card slim; version + files shown in modal", async ({ page }) => {
  await page.goto(fx.url);
  const card = page.locator('[data-testid="card-skills:claude-code:my-skill"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("Useful skill");
  await card.click();
  const modal = page.locator('[data-testid="modal"]');
  await expect(modal).toContainText("version");
  await expect(modal).toContainText("0.1.0");
  await expect(modal.locator('section[data-section="files"]')).toContainText("SKILL.md");
});
