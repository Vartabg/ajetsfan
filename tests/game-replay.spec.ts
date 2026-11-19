import { expect, test, type Locator, type Page } from "@playwright/test";

const cleveland = "2022_02_NYJ_CLE";
const buffalo = "2026_10_BUF_NYJ";
const reader = (game: string) => "/replay/" + game;
const wilson = reader(cleveland) + "?play=4199&pace=all";
const viewer = (page: Page) => page.locator("#replay-viewer");
const control = (page: Page, name: string) => viewer(page).getByRole("link", { name, exact: true });
const frames = (url: URL) => /^\/replay\/[^/]+\/frames$/.test(url.pathname);

async function expectPlay(page: Page, game: string, key: string) {
  await expect(control(page, "Analyze this play")).toHaveAttribute("href", "/plays/" + game + "/" + key);
}

async function expectScore(page: Page, jets: number, opponent: number) {
  const score = viewer(page).getByRole("group", { name: "Score after this play", exact: true });
  await expect(score.locator("strong")).toHaveText([String(jets), String(opponent)]);
}

async function destination(page: Page, name: string) {
  const link = control(page, name);
  await expect(link).toHaveAttribute("href", /.+/);
  return new URL((await link.getAttribute("href"))!, page.url());
}

async function expectBookend(page: Page, name: "Previous" | "Next") {
  const end = control(page, name);
  await expect(end).toBeVisible();
  await expect(end).toHaveAttribute("aria-disabled", "true");
  await expect(end).not.toHaveAttribute("href", /.+/);
}

function drawing(figure: Locator) {
  return figure.locator("svg path").evaluateAll(paths => paths.map(path => path.getAttribute("d")).join("|"));
}

test("Cleveland opens at its kickoff in key pace and preserves later accounts outside HTML and navigation data", async ({ page, request }) => {
  const response = await page.goto(reader(cleveland));
  expect(response?.ok()).toBe(true);
  const flight = await request.get(reader(cleveland), { headers: { RSC: "1" } });
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  for (const payload of [await response!.text(), await flight.text()]) {
    expect(payload).toContain("C.York kicks 56 yards");
    expect(payload).not.toMatch(/Mi\.Carter left guard to NYJ 32|N\.Chubb left tackle for 4 yards, TOUCHDOWN|G\.Wilson for 15 yards, TOUCHDOWN|INTERCEPTED by 21-A\.Davis|Flacco kneels to NYJ 49|31[–-]30/);
  }
  await expectPlay(page, cleveland, "41");
  await expectScore(page, 0, 0);
  await expect(control(page, "Key plays")).toHaveAttribute("aria-current", "true");
  await expectBookend(page, "Previous");
  expect((await destination(page, "Next")).searchParams.get("play")).toBe("524");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Replay a Jets game · ajetsfan");
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/plays\/opengraph-image/);
  await page.goto(reader(cleveland) + "?play=4307");
  await expectPlay(page, cleveland, "4307");
  await expect(viewer(page).getByRole("heading", { name: "The quarterback takes a knee." })).toBeVisible();
  await expectBookend(page, "Next");
  expect((await destination(page, "Previous")).searchParams.get("play")).toBe("4276");
});

test.describe("with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("the report, native replay links and exact analysis connect the tying catch and go-ahead kick", async ({ page }) => {
    await page.goto("/games/" + cleveland);
    await page.getByRole("link", { name: "Replay this game", exact: true }).click();
    await expectPlay(page, cleveland, "41");
    await control(page, "Every play").press("Enter");
    await expectPlay(page, cleveland, "41");
    expect((await destination(page, "Next")).searchParams.get("play")).toBe("63");
    await control(page, "Next").press("Enter");
    await expectPlay(page, cleveland, "63");
    await page.goto(wilson);
    await expectPlay(page, cleveland, "4199");
    await expectScore(page, 30, 30);
    const scoring = viewer(page).getByRole("figure", { name: "Scoring margin" });
    const tied = await drawing(scoring);
    await control(page, "Next").press("Enter");
    await expectPlay(page, cleveland, "4224");
    await expectScore(page, 31, 30);
    await expect(viewer(page)).toContainText("Zuerlein makes the extra point.");
    expect(await drawing(scoring)).not.toBe(tied);
    await control(page, "Previous").press("Enter");
    await expectPlay(page, cleveland, "4199");
    await expectScore(page, 30, 30);
    expect(await drawing(scoring)).toBe(tied);
    await control(page, "Analyze this play").click();
    await expect(page).toHaveURL(url => url.pathname === "/plays/" + cleveland + "/4199");
    await page.getByRole("link", { name: "Replay the game from this play", exact: true }).click();
    await expectPlay(page, cleveland, "4199");
  });
});

test("changing pace between two key plays keeps the selected snap and seeks the strict neighbor", async ({ page }) => {
  await page.goto(reader(cleveland) + "?play=4255&pace=all");
  await expectPlay(page, cleveland, "4255");
  expect((await destination(page, "Previous")).searchParams.get("play")).toBe("4240");
  await control(page, "Key plays").click();
  await expectPlay(page, cleveland, "4255");
  await expect(page).toHaveURL(url => url.searchParams.get("play") === "4255" && url.searchParams.get("pace") !== "all");
  await expect(control(page, "Key plays")).toHaveAttribute("aria-current", "true");
  expect((await destination(page, "Previous")).searchParams.get("play")).toBe("4224");
  expect((await destination(page, "Next")).searchParams.get("play")).toBe("4276");
  await control(page, "Every play").click();
  await expect(page).toHaveURL(url => url.searchParams.get("play") === "4255" && url.searchParams.get("pace") === "all");
  await expectPlay(page, cleveland, "4255");
  await control(page, "Previous").click();
  await expectPlay(page, cleveland, "4240");
  await expect(viewer(page).getByRole("heading", { name: "The kickoff goes for a touchback." })).toBeVisible();
  await page.reload();
  await expectPlay(page, cleveland, "4240");
});

test.describe("touch replay", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, contextOptions: { reducedMotion: "reduce" } });

  test("three taps during the first deck request advance three plays and preserve browser Back and Forward", async ({ page }) => {
    const fetched: string[] = [];
    const extraGameRequests: string[] = [];
    let hold = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/data/snaps/") || hold && path === reader(cleveland)) extraGameRequests.push(request.url());
    });
    await page.route(frames, async route => {
      fetched.push(route.request().method() + " " + new URL(route.request().url()).pathname);
      if (hold) await gate;
      await route.continue();
    });
    await page.goto(wilson, { waitUntil: "networkidle" });
    await expectPlay(page, cleveland, "4199");
    expect(fetched).toEqual([]);
    const next = control(page, "Next");
    await next.scrollIntoViewIfNeeded();
    const rect = (await next.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    const tap = () => page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const firstRequest = page.waitForRequest(req => frames(new URL(req.url())));
    hold = true;
    try {
      await Promise.all([firstRequest, tap()]);
      await tap();
      await tap();
    } finally {
      release();
    }
    const response = await (await firstRequest).response();
    expect(response?.ok()).toBe(true);
    const deck = await response!.json();
    expect(deck.id).toBe(cleveland);
    expect(deck.plays.map((play: { key: string }) => play.key).slice(-6)).toEqual(["4199", "4224", "4240", "4255", "4276", "4307"]);
    expect(new Set(JSON.stringify(deck).match(/\b\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}\b/g))).toEqual(new Set([cleveland]));
    await expectPlay(page, cleveland, "4255");
    await expectScore(page, 31, 30);
    await page.goBack();
    await expectPlay(page, cleveland, "4240");
    await page.goBack();
    await expectPlay(page, cleveland, "4224");
    await page.goForward();
    await expectPlay(page, cleveland, "4240");
    await page.goForward();
    await expectPlay(page, cleveland, "4255");
    const after = (await next.boundingBox())!;
    expect(Math.abs(after.y - rect.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.x - rect.x)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(fetched).toEqual(["GET " + reader(cleveland) + "/frames"]);
    expect(extraGameRequests).toEqual([]);
  });
});

test("Buffalo's pass and next run use Jets-left field coordinates and Previous restores the drawing", async ({ page }) => {
  await page.goto(reader(buffalo) + "?play=2511&pace=all");
  await expectPlay(page, buffalo, "2511");
  await expectScore(page, 9, 10);
  await expect(viewer(page).getByRole("heading", { name: "Allen to Kincaid for 54 yards." })).toBeVisible();
  await expect(viewer(page)).toContainText("first-and-goal at the Jets 8");
  const field = viewer(page).getByRole("figure", { name: "Field position" });
  const marker = (name: string) => field.locator('[data-marker="' + name + '"]');
  await expect(marker("snap")).toHaveAttribute("data-yard", "62");
  await expect(marker("gain")).toHaveAttribute("data-yard", "52");
  await expect(marker("finish")).toHaveAttribute("data-yard", "8");
  const centre = (name: string) => marker(name).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.x + rect.width / 2;
  });
  expect(await centre("finish")).toBeLessThan(await centre("gain"));
  expect(await centre("gain")).toBeLessThan(await centre("snap"));
  const pass = await drawing(field);
  await control(page, "Next").press("ArrowRight");
  await expectPlay(page, buffalo, "2541");
  await expect(viewer(page)).toContainText("from the Jets 8 to the Jets 7");
  await expect(marker("snap")).toHaveAttribute("data-yard", "8");
  await expect(marker("finish")).toHaveAttribute("data-yard", "7");
  expect(await drawing(field)).not.toBe(pass);
  await control(page, "Previous").press("ArrowLeft");
  await expectPlay(page, buffalo, "2511");
  await expectScore(page, 9, 10);
  expect(await drawing(field)).toBe(pass);
});

test("a failed game deck request opens the actual Next link as a document", async ({ page }) => {
  const requested: string[] = [];
  await page.route(frames, async route => {
    requested.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporarily unavailable"}' });
  });
  await page.goto(wilson, { waitUntil: "networkidle" });
  const fallback = await destination(page, "Next");
  const loaded = page.waitForResponse(reply => reply.request().isNavigationRequest() && reply.url() === fallback.href.split("#")[0]);
  await control(page, "Next").click();
  expect((await loaded).ok()).toBe(true);
  await expectPlay(page, cleveland, "4224");
  await expectScore(page, 31, 30);
  expect(requested).toEqual([reader(cleveland) + "/frames"]);
});

test("going Back while the first deck is pending cannot move a reader away from the analysis they reopened", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(frames, async route => { await gate; await route.continue(); });
  const analysis = "/plays/" + cleveland + "/4199";
  await page.goto(analysis);
  await page.getByRole("link", { name: "Replay the game from this play", exact: true }).click();
  await expectPlay(page, cleveland, "4199");
  const request = page.waitForRequest(req => frames(new URL(req.url())));
  try {
    await Promise.all([request, control(page, "Next").click()]);
    await page.goBack();
    await expect(page).toHaveURL(url => url.pathname === analysis);
  } finally {
    release();
  }
  const response = await (await request).response();
  if (response) await response.finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page).toHaveURL(url => url.pathname === analysis);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garrett Wilson catches the touchdown.");
  await expect(viewer(page)).toHaveCount(0);
});

test("unknown games and plays display the missing-page view without an invented replay", async ({ page }) => {
  for (const path of [reader("1900_01_NYJ_CLE"), reader(cleveland) + "?play=4200", reader(cleveland) + "?play=4199x"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blown coverage.");
    await expect(viewer(page)).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("G.Wilson for 15 yards");
  }
});

test("old kickoffs keep the team and field spots from the season being replayed", async ({ page }) => {
  const field = viewer(page).getByRole("figure", { name: "Field position" });
  await page.goto(reader("1999_07_NYJ_OAK"));
  await expect(field).toContainText("Kick OAK 30");
  await expect(field).toContainText("Returned to NYJ 27");
  await page.goto(reader("2004_02_NYJ_SD"));
  await expect(field).toContainText("SD end zone");
  await expect(field).toContainText("Returned to SD 20");
});
