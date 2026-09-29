import { expect, test, type Page } from "@playwright/test";

const ORIGIN = "http://localhost:3210";

async function startGame(page: Page, tribe: string, mode: "mock" | "live", seed = "e2e-seed") {
  await page.goto("/");
  await expect(page.locator(".tribe-card")).toHaveCount(4);
  // The map is not revealed before committing to a tribe.
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`^${tribe}`, "i") }).first().click();
  await page.locator(`input[value="${mode}"]`).check();
  await page.locator("summary", { hasText: "Advanced" }).click();
  await page.getByPlaceholder("random").fill(seed);
  await page.getByRole("button", { name: new RegExp(`Support ${tribe}`, "i") }).click();
  await page.waitForURL(/\/game\//);
  await page.getByRole("button", { name: "Start watching" }).click();
  await expect(page.locator(".map-canvas")).toBeVisible();
}

async function playerTurn(page: Page, optionIndex = 0) {
  await page.locator(".option").nth(optionIndex).click();
  await page.getByRole("button", { name: "Confirm choice" }).click();
}

async function apiGame(page: Page, id: string) {
  const res = await page.request.get(`/api/games/${id}`);
  return (await res.json()).game;
}

test("setup, odd/even turns, inspector, and same-origin-only traffic", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(ORIGIN) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) foreign.push(r.url());
  });
  await startGame(page, "Windstep", "mock");
  await expect(page.getByText("MOCK SIMULATION")).toBeVisible();
  await expect(page.getByText("Applies to: the whole land")).toBeVisible();
  await expect(page.getByText("Turn 1 of 50")).toBeVisible();
  await expect(page.getByText("Your turn")).toBeVisible();
  await playerTurn(page, 1);
  // Turn 2 is Nature's and runs automatically; turn 3 returns to the player.
  await expect(page.getByText("Turn 3 of 50")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".log-turn")).toHaveCount(2);
  await expect(page.locator(".log-turn").nth(0)).toContainText("Nature");
  await page.getByRole("tab", { name: /inspector/i }).click();
  await expect(page.getByText("Mock simulation — not Jev")).toBeVisible();
  await expect(page.getByText(/model's preference among the listed legal actions/)).toBeVisible();
  await page.getByRole("tab", { name: "Context sent" }).click();
  await expect(page.locator("pre.context")).toContainText('"questions"');
  expect(foreign).toEqual([]);
});

test("pause holds a Nature turn and reload resumes the same pending turn", async ({ page }) => {
  await startGame(page, "Hearthwood", "mock", "pause-seed");
  await page.getByRole("button", { name: /Pause Nature/ }).click();
  await playerTurn(page, 0);
  await expect(page.getByText("Turn 2 of 50")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Nature chooses")).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByText("Turn 2 of 50")).toBeVisible();
  const picked = await page.locator(".option.nature-picked .label span").first().textContent();
  await page.reload();
  await expect(page.getByText("Turn 2 of 50")).toBeVisible();
  // The frozen Nature option survives reload; pausing never rerolls it.
  await expect(page.locator(".option.nature-picked .label span").first()).toHaveText(picked ?? "");
  await page.getByRole("button", { name: /Resume Nature/ }).first().click();
  await expect(page.getByText("Turn 3 of 50")).toBeVisible({ timeout: 30_000 });
});

test("keyboard users can choose an event option and confirm it", async ({ page }) => {
  await startGame(page, "Stonehaven", "mock", "keyboard-seed");
  await page.getByRole("button", { name: /Pause Nature/ }).click();
  const option = page.locator(".option").nth(2);
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(option).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Confirm choice" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Turn 2 of 50")).toBeVisible({ timeout: 30_000 });
});

test("two tabs cannot commit two turns for one intent", async ({ page, context }) => {
  await startGame(page, "Ironfang", "mock", "tabs-seed");
  await page.getByRole("button", { name: /Pause Nature/ }).click();
  const id = page.url().split("/game/")[1]!;
  const other = await context.newPage();
  await other.goto(`/game/${id}`);
  await expect(other.getByText("Turn 1 of 50")).toBeVisible();
  await page.locator(".option").nth(0).click();
  await other.locator(".option").nth(1).click();
  await Promise.all([page.getByRole("button", { name: "Confirm choice" }).click(), other.getByRole("button", { name: "Confirm choice" }).click()]);
  await expect.poll(async () => (await apiGame(page, id)).completedTurn, { timeout: 30_000 }).toBe(1);
  await page.waitForTimeout(1500);
  const g = await apiGame(page, id);
  expect(g.completedTurn).toBe(1);
  const turns = await page.request.get(`/api/games/${id}/replay?deltas=0`);
  expect((await turns.json()).turns.length).toBe(1);
});

test("a failed live turn pauses with Retry and resumes the same frozen intent", async ({ page }) => {
  await startGame(page, "Windstep", "live", "fail-seed");
  await expect(page.getByText(/LIVE · jev-1.13.0/)).toBeVisible();
  await page.getByRole("button", { name: /Pause Nature/ }).click();
  await playerTurn(page, 0);
  await expect(page.getByText("Turn 2 of 50")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Resume Nature/ }).first().click();
  await expect(page.getByText("Turn 3 of 50")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Pause Nature/ }).click();
  await playerTurn(page, 2);
  // The stub fails every attempt on turn 3 → explicit paused state, nothing advanced.
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No turn was simulated/)).toBeVisible();
  const id = page.url().split("/game/")[1]!;
  expect((await apiGame(page, id)).completedTurn).toBe(2);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Turn 4 of 50")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /inspector/i }).click();
  await expect(page.getByText("Live Jev output")).toBeVisible();
});

test("final results after a 20-turn match with ranking, components, history, and timeline", async ({ page }) => {
  await page.goto("/");
  const created = await page.request.post("/api/games", { data: { tribeId: "hearthwood", mode: "mock", seed: "final-seed", totalTurns: 20 }, headers: { origin: ORIGIN } });
  expect(created.status()).toBe(201);
  let g = (await created.json()).game;
  while (g.completedTurn < 20) {
    const res = await page.request.post(`/api/games/${g.id}/turns`, {
      headers: { origin: ORIGIN },
      data: {
        expectedVersion: g.version,
        expectedTurn: g.completedTurn + 1,
        eventId: g.event.eventId,
        idempotencyKey: `final-${g.completedTurn + 1}-abcdef`,
        ...(g.event.source === "player" ? { optionId: g.event.options[g.completedTurn % 3].id } : {}),
      },
    });
    expect(res.status()).toBe(200);
    g = (await res.json()).game;
  }
  expect(g.status).toBe("finished");
  await page.goto(`/game/${g.id}`);
  await page.getByRole("button", { name: "Start watching" }).click();
  await expect(page.getByText("Final results after 20 turns")).toBeVisible();
  await expect(page.locator(".ranking tbody tr").first()).toBeVisible();
  await expect(page.getByText("Population history")).toBeVisible();
  await expect(page.locator(".timeline tbody tr")).toHaveCount(20);
  await page.getByRole("link", { name: "Replay match" }).click();
  await expect(page.getByText("REPLAY")).toBeVisible();
  await page.getByRole("button", { name: /Next/ }).click();
  await expect(page.getByText(/Turn 1 of 20/)).toBeVisible();
});
