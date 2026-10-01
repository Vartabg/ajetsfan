import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FAN_MEMORIES, fanMemoryForGame, selectFanMemories, type FanMemory } from "../src/lib/fan-memories";
import { morgueEpitaph } from "../src/lib/morgue";
import type { Game } from "../src/lib/games";

const archive = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
const cases = selectFanMemories(archive);
const memoryGame = (memory: FanMemory, overrides: Partial<Game> = {}): Game => ({
  ...memory.fixture, opponentDisplay: memory.fixture.opponent, dataSuspect: false,
  swing: .4, peakH2Wp: .7, troughH2Wp: .4, roof: null, temp: null, wind: null,
  keyPlay: { desc: null, wpa: null, qtr: null, secondsLeft: null }, ...overrides,
});

test.describe("memory fixture integrity", () => {
  test("editorial order preserves the named games, zero-score shutout, and cross-year playoff dates", () => {
    const selected = selectFanMemories(FAN_MEMORIES.map((memory) => memoryGame(memory)).reverse());
    expect(selected.map(({ game }) => game.id)).toEqual([
      "2000_08_MIA_NYJ", "2010_19_NYJ_NE", "2002_18_IND_NYJ", "2012_12_NE_NYJ",
    ]);
    expect(selected[1].game).toMatchObject({ season: 2010, date: "2011-01-16", seasonType: "POST" });
    expect(selected[2].game).toMatchObject({ season: 2002, date: "2003-01-04", oppScore: 0 });
    for (const { memory, game, board, href } of selected) {
      const url = new URL(href, "https://example.test");
      expect(url.searchParams.get("game")).toBe(game.id);
      expect(url.searchParams.get("board")).toBe(game.outcome === "win" ? "miracle" : "heartbreak");
      expect(board).toBe(game.outcome === "win" ? "miracle" : "heartbreak");
      expect(new URL(memory.source.url).hostname).toBe("www.newyorkjets.com");
      expect(morgueEpitaph(game)).toBe(memory.epitaph);
    }
  });

  test("absent cases never become invented fixtures", () => {
    expect(selectFanMemories([])).toEqual([]);
    const game = memoryGame(FAN_MEMORIES[0]);
    expect(selectFanMemories([game]).map(({ game }) => game.id)).toEqual([game.id]);
  });

  test("suspect or missing, non-finite, and out-of-range probability data cannot publish a memory", () => {
    for (const memory of FAN_MEMORIES) {
      const invalid: Partial<Game>[] = [
        { dataSuspect: true }, { swing: null }, { swing: Number.NaN },
        { swing: Number.POSITIVE_INFINITY }, { swing: Number.NEGATIVE_INFINITY },
        { swing: -.01 }, { swing: 1.01 },
      ];
      for (const overrides of invalid) {
        const game = memoryGame(memory, overrides);
        expect(selectFanMemories([game])).toEqual([]);
        expect(fanMemoryForGame(game)).toBeNull();
        expect(morgueEpitaph(game)).not.toBe(memory.epitaph);
      }
      for (const swing of [0, 1]) expect(selectFanMemories([memoryGame(memory, { swing })])).toHaveLength(1);
    }
  });

  test("changed fixture metadata cannot inherit the original story or specific epitaph", () => {
    for (const memory of FAN_MEMORIES) {
      const fixture = memory.fixture;
      const changes: Partial<Game>[] = [
        { id: `${fixture.id}_corrected` }, { season: fixture.season + 1 },
        { week: fixture.week + 1 }, { seasonType: fixture.seasonType === "POST" ? "REG" : "POST" },
        { date: "2026-09-27" }, { opponent: "BUF" }, { atHome: !fixture.atHome },
        { jetsScore: fixture.jetsScore + 1 }, { oppScore: fixture.oppScore + 1 },
        { outcome: fixture.outcome === "win" ? "loss" : "win" }, { wentToOt: !fixture.wentToOt },
      ];
      for (const overrides of changes) {
        const game = memoryGame(memory, overrides);
        expect(selectFanMemories([game])).toEqual([]);
        expect(fanMemoryForGame(game)).toBeNull();
        expect(morgueEpitaph(game)).not.toBe(memory.epitaph);
      }
    }
  });

  test("duplicate fixture identities are withheld even when one copy matches", () => {
    const game = memoryGame(FAN_MEMORIES[0]);
    const corrected = { ...game, jetsScore: game.jetsScore + 1 };
    expect(selectFanMemories([game, corrected])).toEqual([]);
    expect(selectFanMemories([corrected, game])).toEqual([]);
    expect(selectFanMemories([game, { ...game }])).toEqual([]);
  });
});

test.describe("memory ledger entry points", () => {
  test("full cases distinguish fan commentary from sourced facts and display the playoff season correctly", async ({ page }) => {
    await page.goto("/morgue");
    const wall = page.locator("#fan-memories");
    await expect(wall.getByRole("heading", { name: "The cases we still talk about.", exact: true })).toBeVisible();
    await expect(wall.locator("article")).toHaveCount(cases.length);
    for (const { memory, game, href } of cases) {
      const article = wall.locator(`#memory-${game.id}`);
      await expect(article.getByText("Fan reaction", { exact: true })).toBeVisible();
      await expect(article.getByText(memory.reaction, { exact: true })).toBeVisible();
      await expect(article.getByText("What happened", { exact: true })).toBeVisible();
      await expect(article).toContainText(memory.fact);
      await expect(article.getByRole("link", { name: `Open the ${memory.title} case`, exact: true })).toHaveAttribute("href", `${href}#game-case-heading`);
      await expect(article.getByRole("link", { name: memory.source.label, exact: true })).toHaveAttribute("href", memory.source.url);
    }
    const foxborough = wall.locator("#memory-2010_19_NYJ_NE");
    await expect(foxborough).toContainText("2010 postseason");
    await expect(foxborough.locator("time")).toHaveAttribute("datetime", "2011-01-16");
  });

  test("a keyboard case link opens its matching board and the return control focuses its archive row", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const selected = cases.find(({ game }) => game.id === "2012_12_NE_NYJ")!;
    await page.goto("/morgue");
    const entry = page.locator("#fan-memories").getByRole("link", { name: `Open the ${selected.memory.title} case`, exact: true });
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL((url) => url.searchParams.get("game") === selected.game.id && url.searchParams.get("board") === selected.board && url.hash === "#game-case-heading");
    await expect(page.locator("#game-case-heading")).toBeInViewport();
    await expect(page.getByRole("figure", { name: `Game analysis: ${selected.game.date} ${selected.game.opponentDisplay}`, exact: true })).toContainText(selected.memory.epitaph);
    await page.getByRole("button", { name: "Back to results", exact: true }).click();
    await expect(page.locator(`#archive-game-${selected.game.id}`)).toBeFocused();
    await expect(page.locator(`#archive-game-${selected.game.id}`)).toHaveAttribute("aria-pressed", "true");
  });

  test("home clippings offer each valid case and a keyboard route to the full memory ledger", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const wall = page.locator("#remembered-cases");
    await expect(wall.getByRole("heading", { name: "Never let them forget.", exact: true })).toBeVisible();
    for (const { memory, href } of cases) await expect(wall.getByRole("link", { name: `Open the ${memory.title} case`, exact: true })).toHaveAttribute("href", `${href}#game-case-heading`);
    const ledger = wall.getByRole("link", { name: "Read the memory ledger", exact: true });
    await ledger.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/morgue#fan-memories$/);
    await expect(page.locator("#fan-memories-heading")).toBeInViewport();
  });

  for (const enlarged of [false, true]) {
    test(`memory layouts remain within a 320px phone${enlarged ? " with 200% text" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 1000 });
      for (const route of ["/", "/morgue"]) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
        await page.evaluate(() => document.fonts.ready);
        const wall = page.locator(route === "/" ? "#remembered-cases" : "#fan-memories");
        await wall.scrollIntoViewIfNeeded();
        await expect(wall).toBeVisible();
        const geometry = await wall.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            viewport: innerWidth, right: rect.right, left: rect.left,
            overflow: Array.from(element.querySelectorAll("*")).filter((child) => {
              const box = child.getBoundingClientRect();
              return box.right > rect.right + 1 || box.left < rect.left - 1;
            }).map((child) => child.tagName + "." + child.className),
          };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.overflow).toEqual([]);
      }
    });
  }
});
