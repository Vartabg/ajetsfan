import { expect, test, type Locator, type Page } from "@playwright/test";

const cleveland = "2022_02_NYJ_CLE";
const buffalo = "2026_10_BUF_NYJ";
const replay = (game: string, play: string) => "/replay/" + game + "?play=" + play + "&pace=all";
const exact = (game: string, play: string) => "/plays/" + game + "/" + play;
const board = (page: Page) => page.getByRole("region", { name: "Xs & Os", exact: true });
const phase = (region: Locator, name: "At the snap" | "Play action") => region.getByRole("radio", { name, exact: true });
const frame = (region: Locator, name: "snap" | "action") => region.locator('[data-phase="' + name + '"]');
const path = (frame: Locator, kind: string) => frame.locator('[data-path="' + kind + '"]');
const player = (frame: Locator, unit: "O" | "X", surname: string) =>
  frame.locator('[data-unit="' + unit + '"][data-label*="' + surname + '" i]').first();

async function expectReplaySelection(page: Page, game: string, key: string, pace: "all" | "key" = "all") {
  await expect(page).toHaveURL(url => url.pathname === "/replay/" + game && url.searchParams.get("play") === key &&
    url.searchParams.get("view") === "chalk" && (url.searchParams.get("pace") ?? "key") === pace);
  const link = page.locator("#replay-viewer").getByRole("link", { name: "Analyze this play", exact: true });
  await expect(link).toHaveAttribute("href", new RegExp("^/plays/" + game + "/" + key + "(?:[?#]|$)"));
}

/** Measure the movement the browser actually draws, including any team-dependent SVG transforms. */
async function drawnRise(mark: Locator) {
  return mark.evaluate(element => {
    const shape = element instanceof SVGGeometryElement ? element : element.querySelector<SVGGeometryElement>("path, polyline, line");
    if (!shape) throw new Error("No drawn movement");
    const screen = shape.getScreenCTM();
    if (!screen) throw new Error("No rendered field");
    const start = shape.getPointAtLength(0).matrixTransform(screen);
    const finish = shape.getPointAtLength(shape.getTotalLength()).matrixTransform(screen);
    return start.y - finish.y;
  });
}

test.describe("native links and radio controls without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const surface of ["game replay", "exact play"]) {
    test(surface + " offers one field view and switches Wilson’s diagram without changing the clock", async ({ page }) => {
      const location = surface === "game replay" ? replay(cleveland, "4199") : exact(cleveland, "4199");
      const area = page.locator(surface === "game replay" ? "#replay-viewer" : "#evidence");
      await page.goto(location);
      await expect(area.getByRole("figure", { name: "Field position", exact: true })).toBeVisible();
      await expect(board(page)).toHaveCount(0);
      const mode = area.getByRole("link", { name: "Xs & Os", exact: true });
      await expect(mode).toHaveAttribute("href", /[?&]view=chalk(?:&|#|$)/);
      await mode.click();
      const region = board(page);
      await expect(region).toBeVisible();
      await expect(area.getByRole("figure", { name: "Field position", exact: true })).toHaveCount(0);
      const before = page.url();
      await expect(phase(region, "Play action")).toBeChecked();
      await expect(frame(region, "action")).toBeVisible();
      await expect(frame(region, "snap")).toBeHidden();
      await phase(region, "Play action").press("ArrowLeft");
      await expect(phase(region, "At the snap")).toBeChecked();
      await expect(phase(region, "At the snap")).toBeFocused();
      expect(await phase(region, "At the snap").evaluate(input => {
        const label = (input as HTMLInputElement).labels?.[0];
        return label ? parseFloat(getComputedStyle(label).outlineWidth) : 0;
      })).toBeGreaterThanOrEqual(2);
      const setup = frame(region, "snap");
      await expect(setup).toBeVisible();
      await expect(frame(region, "action")).toBeHidden();
      await expect(setup.locator('[data-unit="O"]')).toHaveCount(11);
      await expect(setup.locator('[data-unit="X"]')).toHaveCount(11);
      await expect(setup.locator('[data-unit="O"][data-tag="WR"]')).toHaveCount(3);
      await expect(setup.locator('[data-unit="X"][data-tag="DB"]')).toHaveCount(5);
      await expect(region).toContainText(/shotgun/i);
      await expect(region).toContainText("1 RB, 1 TE, 3 WR");
      await expect(region).toContainText("4 DL, 2 LB, 5 DB");
      await expect(region).toContainText(/O\s*Jets offense/i);
      await expect(region).toContainText(/X\s*Browns defense/i);
      await expect(region).toContainText(/cover[ _-]?6/i);
      await expect(region).toContainText(/4 (?:pass )?rushers/i);
      await expect(region).toContainText(/schematic/i);
      await phase(region, "At the snap").press("ArrowRight");
      await expect(phase(region, "Play action")).toBeChecked();
      await expect(frame(region, "action")).toBeVisible();
      expect(page.url()).toBe(before);
      await expect(region).toContainText(/slant/i);
      await expect(region).toContainText(/post/i);
      await expect(region.locator('a[href="/film-room/replay/wilson-cleveland"]')).toBeVisible();
      await expect(region).toContainText(/next gen stats/i);
      await expect(region.locator('a[href*="creativecommons.org/licenses/by-sa/4.0"]')).toBeVisible();
      await area.getByRole("link", { name: "Field position", exact: true }).click();
      await expect(board(page)).toHaveCount(0);
      await expect(area.getByRole("figure", { name: "Field position", exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("view")).not.toBe("chalk");
    });
  }
});

test("a kickoff assigns the units correctly and its initial payload contains only the selected play’s evidence", async ({ page, request }) => {
  const url = "/replay/" + cleveland + "?view=chalk";
  const html = await page.goto(url);
  expect(html?.ok()).toBe(true);
  const flight = await request.get(url, { headers: { RSC: "1" } });
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  for (const payload of [await html!.text(), await flight.text()]) {
    expect(payload).toContain("C.York kicks 56 yards");
    expect(payload).not.toMatch(/Mi\.Carter left guard to NYJ 32|G\.Wilson for 15 yards, TOUCHDOWN|INTERCEPTED by 21-A\.Davis|31[–-]30/);
  }
  const action = frame(board(page), "action");
  await expect(action).toBeVisible();
  await expect(player(action, "O", "York")).toBeVisible();
  await expect(player(action, "X", "Berrios")).toBeVisible();
  await expect(player(action, "O", "Delpit")).toBeVisible();
  await expect(board(page)).toContainText(/O\s*Browns kick/i);
  await expect(board(page)).toContainText(/X\s*Jets receive/i);
  expect(await drawnRise(path(action, "kick"))).toBeGreaterThan(0);
  expect(await drawnRise(path(action, "return"))).toBeLessThan(0);
});

test("Buffalo’s completion separates the flight from the run after the catch on an offense-up board", async ({ page }) => {
  await page.goto(exact(buffalo, "2511") + "?view=chalk");
  const region = board(page);
  const action = frame(region, "action");
  await expect(player(action, "O", "Allen")).toBeVisible();
  await expect(player(action, "O", "Kincaid")).toBeVisible();
  await expect(player(action, "X", "Belton")).toBeVisible();
  await expect(region).toContainText(/O\s*Bills offense/i);
  await expect(region).toContainText(/X\s*Jets defense/i);
  await expect(region).toContainText(/21 yards downfield/i);
  await expect(region).toContainText(/33 (?:yards )?after (?:the )?catch/i);
  expect(await drawnRise(path(action, "pass"))).toBeGreaterThan(0);
  expect(await drawnRise(path(action, "carry"))).toBeGreaterThan(0);
  await expect(region).toContainText(/play-by-play/i);
  await expect(region).not.toContainText(/cover[ _-]?6|Next Gen Stats|FTN Data/i);
});

test("a later charted game credits FTN, preserves zero rushers and separates the primary route from the throw", async ({ page }) => {
  await page.goto(exact("2023_09_LAC_NYJ", "4356") + "?view=chalk");
  const region = board(page), action = frame(region, "action");
  await expect(region).toContainText("0 pass rushers");
  await expect(region).toContainText(/cover 4/i);
  await expect(player(action, "O", "Conklin")).toBeVisible();
  await expect(path(action, "pass")).toBeVisible();
  await expect(path(action, "carry")).toHaveCount(0);
  await expect(region.getByText("quick out", { exact: true })).toBeVisible();
  await expect(action).not.toContainText(/quick out/i);
  await expect(region.getByRole("link", { name: "FTN Data via nflverse", exact: true }))
    .toHaveAttribute("href", /pbp_participation_2023\.parquet$/);
  await expect(region.getByRole("link", { name: "CC BY-SA 4.0", exact: true }))
    .toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
});

test("runs, incompletions, sacks and interceptions retain their credited actors and direction of play", async ({ page }) => {
  const region = board(page);
  const action = frame(region, "action");
  await page.goto(exact(buffalo, "2541") + "?view=chalk");
  await expect(player(action, "O", "Cook")).toBeVisible();
  expect(await drawnRise(path(action, "carry"))).toBeGreaterThan(0);
  await page.goto(exact("1999_01_NE_NYJ", "97") + "?view=chalk");
  await expect(player(action, "O", "Faulk")).toBeVisible();
  expect(await drawnRise(path(action, "carry"))).toBeLessThan(0);
  await expect(region).toContainText(/play-by-play/i);
  await expect(region.getByRole("radio", { name: "At the snap", exact: true })).toHaveCount(0);
  await expect(region).not.toContainText(/next gen stats|FTN Data/i);
  await page.goto(exact(buffalo, "221") + "?view=chalk");
  await expect(player(action, "O", "Allen")).toBeVisible();
  await expect(player(action, "O", "Moore")).toBeVisible();
  await expect(path(action, "incomplete")).toBeVisible();
  await expect(path(action, "carry")).toHaveCount(0);
  await page.goto(exact(buffalo, "4138") + "?view=chalk");
  await expect(region).toContainText(/sack/i);
  await expect(player(action, "O", "Klubnik")).toBeVisible();
  await expect(player(action, "X", "Hoecht")).toBeVisible();
  await expect(region).toContainText("loss of 3 yards");
  await expect(path(action, "pass")).toHaveCount(0);
  await page.goto(exact(cleveland, "4276") + "?view=chalk");
  await expect(player(action, "O", "Brissett")).toBeVisible();
  await expect(player(action, "X", "Davis")).toBeVisible();
  await expect(path(action, "interception")).toBeVisible();
  expect(await drawnRise(path(action, "return"))).toBeLessThan(0);
  await expect(region).toContainText("14 yards");
  await expect(region.locator('a[href="/film-room/replay/wilson-cleveland"]')).toHaveCount(0);
});

test("a nullified play gives its ruling and record without drawing ball movement", async ({ page }) => {
  await page.goto(exact(cleveland, "4018") + "?view=chalk");
  const region = board(page);
  await expect(region).toBeVisible();
  await expect(region).toContainText(/recorded ruling/i);
  await expect(page.locator("#snap")).toContainText(/neutral zone infraction/i);
  await expect(region.locator("[data-path]")).toHaveCount(0);
});

test("the Elliott touchdown opens its own 22-player teaching board", async ({ page }) => {
  const miami = "2000_08_MIA_NYJ";
  await page.goto(exact(miami, "3744") + "?view=chalk");
  await expect(board(page).getByRole("link", { name: /22-player teaching board/ })).toHaveCount(0);
  await page.goto(exact(miami, "4658") + "?view=chalk");
  await board(page).getByRole("link", { name: /22-player teaching board/ }).click();
  const lab = page.locator("#playbook-lab");
  await expect(lab).toHaveAttribute("data-archive", "elliott-miami");
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
});

test("a failed game download preserves the diagram chosen while Next was loading", async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/frames", async route => { await delayed; await route.abort(); });
  await page.goto(replay(cleveland, "4199"), { waitUntil: "networkidle" });
  const controls = page.locator("#replay-viewer");
  try {
    await Promise.all([page.waitForRequest("**/frames"), controls.getByRole("link", { name: "Next", exact: true }).click()]);
    await controls.getByRole("link", { name: "Xs & Os", exact: true }).click();
  } finally { release(); }
  await expectReplaySelection(page, cleveland, "4224");
  await expect(board(page)).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, contextOptions: { reducedMotion: "reduce" } });

  test("the board stays with replay navigation while phase changes leave the play and history alone", async ({ page }) => {
    const chartRequests: string[] = [];
    page.on("request", request => {
      if (["xhr", "fetch"].includes(request.resourceType()) && /participation|\/data\/.*charting/i.test(request.url())) chartRequests.push(request.url());
    });
    await page.goto(replay(cleveland, "4199"), { waitUntil: "networkidle" });
    const region = board(page);
    const controls = page.locator("#replay-viewer");
    await controls.getByRole("link", { name: "Xs & Os", exact: true }).tap();
    await expectReplaySelection(page, cleveland, "4199");
    const historyCount = await page.evaluate(() => history.length);
    await phase(region, "Play action").press("ArrowLeft");
    await expect(phase(region, "At the snap")).toBeChecked();
    await expectReplaySelection(page, cleveland, "4199");
    expect(await page.evaluate(() => history.length)).toBe(historyCount);
    await controls.getByRole("link", { name: "Next", exact: true }).tap();
    await expectReplaySelection(page, cleveland, "4224");
    await expect(region).toBeVisible();
    await expect(region.locator('a[href="/film-room/replay/wilson-cleveland"]')).toHaveCount(0);
    await controls.getByRole("link", { name: "Previous", exact: true }).tap();
    await expectReplaySelection(page, cleveland, "4199");
    await expect(phase(region, "Play action")).toBeChecked();
    await controls.getByRole("link", { name: "Key plays", exact: true }).tap();
    await expectReplaySelection(page, cleveland, "4199", "key");
    await page.reload();
    await expectReplaySelection(page, cleveland, "4199", "key");
    await expect(region).toBeVisible();
    await page.goBack();
    await expectReplaySelection(page, cleveland, "4199");
    await page.goForward();
    await expectReplaySelection(page, cleveland, "4199", "key");
    expect(await region.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
    })).toBe(true);
    expect(chartRequests).toEqual([]);
  });
});
