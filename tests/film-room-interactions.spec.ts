import { test, expect } from "@playwright/test";
import path from "node:path";

test("case and teaching choices survive back/reload and preserve unrelated URL context", async ({ page }) => {
  await page.goto("/film-room?keep=research#film-room");
  const room = page.locator("#film-room");
  const board = page.locator("#scouting-board");
  await expect(room).toHaveAttribute("data-film", "wilson-cleveland");
  await room.locator('[data-film-case="hall-miami"]').click();
  await board.getByRole("group", { name: "Coverage lesson" }).getByRole("button", { name: "Cover 1", exact: true }).click();
  await board.getByRole("button", { name: "Five-rusher pressure", exact: true }).click();
  await board.getByRole("button", { name: /Assignments/ }).click();
  await room.locator('[data-film-case="sanchez-thanksgiving"]').click();
  await expect(room).toHaveAttribute("data-film", "sanchez-thanksgiving");
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ keep: "research", play: "sanchez-thanksgiving", coverage: "cover-1", pressure: "five", step: "2" });
  await page.goBack();
  await expect(room).toHaveAttribute("data-film", "hall-miami");
  await expect(board).toHaveAttribute("data-pressure", "five");
  await expect(board).toHaveAttribute("data-step", "1");
  await expect(room.locator("[data-film-clock]")).toHaveText("OT");
  await page.reload();
  await expect(room).toHaveAttribute("data-film", "hall-miami");
  await expect(board).toHaveAttribute("data-coverage", "cover-1");
  await expect(board).toHaveAttribute("data-pressure", "five");
  await expect(board).toHaveAttribute("data-step", "1");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("research");
});

test("invalid shared combinations resolve to usable choices and the next interaction writes valid state", async ({ page }) => {
  await page.goto("/film-room?play=unpublished&coverage=cover-1&pressure=six&step=999&keep=context");
  const room = page.locator("#film-room");
  const board = page.locator("#scouting-board");
  await expect(room).toHaveAttribute("data-film", "wilson-cleveland");
  await expect(board).toHaveAttribute("data-coverage", "cover-1");
  await expect(board).toHaveAttribute("data-pressure", "four");
  await expect(board).toHaveAttribute("data-step", "2");
  await board.getByRole("button", { name: "Cover 0", exact: true }).click();
  await expect(board).toHaveAttribute("data-pressure", "six");
  const shared = new URL(page.url());
  expect(shared.searchParams.get("play")).toBe("wilson-cleveland");
  expect(shared.searchParams.get("coverage")).toBe("cover-0");
  expect(shared.searchParams.get("pressure")).toBe("six");
  expect(shared.searchParams.get("step")).toBe("3");
  expect(shared.searchParams.get("keep")).toBe("context");
});

test("category filters keep a selected play visible, including when history changes its category", async ({ page }) => {
  await page.goto("/film-room");
  const room = page.locator("#film-room");
  const filters = room.getByRole("group", { name: "Filter film plays" });
  await expect(room.locator("[data-film-case]")).toHaveCount(4);
  await filters.getByRole("button", { name: "Painful plays", exact: true }).click();
  await expect(room).toHaveAttribute("data-film", "sanchez-thanksgiving");
  await expect(room.locator("[data-film-case]")).toHaveCount(1);
  await expect(filters.getByRole("button", { name: "Painful plays", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "Great plays", exact: true }).click();
  await expect(room).toHaveAttribute("data-film", "wilson-cleveland");
  await expect(room.locator("[data-film-case]")).toHaveCount(3);
  await page.goBack();
  await expect(room).toHaveAttribute("data-film", "sanchez-thanksgiving");
  await expect(filters.getByRole("button", { name: "All plays", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(room.locator('[data-film-case="sanchez-thanksgiving"]')).toHaveAttribute("aria-pressed", "true");
  await expect(room.locator("[data-film-case]")).toHaveCount(4);
});

test("external video requires an explicit load, avoids autoplay and is removed when the case changes", async ({ page }) => {
  const playerRequests: string[] = [];
  await page.route("https://www.youtube-nocookie.com/**", async (route) => {
    playerRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html lang='en'><title>Source player test</title><body>Source player</body></html>" });
  });
  await page.goto("/film-room?play=wilson-cleveland");
  const room = page.locator("#film-room");
  await expect(room.locator("[data-source-video]")).toHaveCount(0);
  expect(playerRequests).toEqual([]);
  await room.getByRole("button", { name: /Load source video/ }).click();
  const player = room.locator("[data-source-video]");
  await expect(player).toHaveCount(1);
  const source = new URL((await player.getAttribute("src"))!);
  expect(source.hostname).toBe("www.youtube-nocookie.com");
  expect(source.pathname).toBe("/embed/LR1zPFNjOMM");
  expect(source.searchParams.get("autoplay")).not.toBe("1");
  expect(await player.getAttribute("allow")).not.toContain("autoplay");
  await expect.poll(() => playerRequests.length).toBe(1);
  await room.getByRole("button", { name: /Close source video/ }).click();
  await expect(player).toHaveCount(0);
  await room.getByRole("button", { name: /Load source video/ }).click();
  await expect(player).toHaveCount(1);
  await room.locator('[data-film-case="sanchez-thanksgiving"]').click();
  await expect(player).toHaveCount(0);
  await expect(room.getByRole("button", { name: /Load source video/ })).toBeVisible();
  await page.goBack();
  await expect(room).toHaveAttribute("data-film", "wilson-cleveland");
  await expect(player).toHaveCount(0);
});

for (const record of [
  { id: "wilson-cleveland", clock: "Q4 0:25", probability: "26.1%", delta: "+31.2 percentage points", game: "2022_02_NYJ_CLE", situation: "3rd-and-10 at the Cleveland 15; Jets trailing 24–30.", result: "Flacco to Wilson: 15-yard touchdown", extra: "touchdown completed at :22" },
  { id: "elliott-miami", clock: "Q4", probability: "26.8%", delta: "+15.1 percentage points", game: "2000_08_MIA_NYJ", situation: "2nd-and-goal at the Miami 3; Jets trailing 30–37.", result: "#76 reported eligible", extra: ":42 after the touchdown; exact snap time is uncertain" },
  { id: "hall-miami", clock: "OT", probability: "78.6%", delta: "+21.4 percentage points", game: "2000_08_MIA_NYJ", situation: "4th-and-2 at the Miami 23; tied 37–37.", result: "John Hall’s 40-yard field goal was good", extra: "OT 8:13 remaining, separately recorded in the gamebook" },
  { id: "sanchez-thanksgiving", clock: "Q2 9:10", probability: "17.6%", delta: "-6.1 percentage points", game: "2012_12_NE_NYJ", situation: "1st-and-10 at the Jets 31, trailing 0–14.", result: "Sanchez gained 1 yard and fumbled", extra: "21–0 after the PAT at 9:00" },
]) {
  test(`${record.id} shows the verified situation without confusing its estimate or clock with the outcome`, async ({ page }) => {
    await page.goto(`/film-room?play=${record.id}`);
    const room = page.locator("#film-room");
    await expect(room).toHaveAttribute("data-film", record.id);
    await expect(room.locator("[data-film-clock]")).toHaveText(record.clock);
    await expect(room.locator("[data-film-probability]")).toHaveText(record.probability);
    await expect(room.locator("[data-film-delta]")).toHaveText(record.delta);
    const notebook = room.locator('[aria-labelledby="film-notebook-heading"]');
    await expect(notebook).toContainText(record.situation);
    await expect(notebook).toContainText(record.result);
    await expect(notebook).toContainText(record.extra);
    await expect(room.getByRole("link", { name: /Complete game evidence/ })).toHaveAttribute("href", `/games/${record.game}`);
    await expect(notebook).toContainText("actual coverage, rush count and protection call have not been verified");
    await expect(notebook).toContainText("verified video offsets");
    if (record.id === "elliott-miami") {
      await expect(room).toContainText(/exact snap clock is uncertain/i);
      await expect(room).toContainText(/repeat 1:20 from the preceding play/i);
      await expect(room.locator("[data-film-description]")).toContainText("(1:20)");
    }
    if (record.id === "hall-miami") {
      await expect(room).toContainText("NYJ 40 — MIA 37");
      await expect(room.locator("[data-film-probability]")).not.toHaveText("100.0%");
    }
    if (record.id === "sanchez-thanksgiving") await expect(notebook).toContainText("Sanchez said he confused the play");
  });
}

test("keyboard controls expose compatible packages, eleven distinct defenders and manual teaching steps", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/film-room?keep=keyboard#scouting-board");
  const board = page.locator("#scouting-board");
  const coverages = board.getByRole("group", { name: "Coverage lesson" });
  const packages = [
    { name: "Cover 0", pressure: "Six-rusher pressure", roles: [6, 0, 0, 5], optionCount: 1 },
    { name: "Cover 1", pressure: "Four rushers", roles: [4, 1, 1, 5], optionCount: 2 },
    { name: "Cover 1", pressure: "Five-rusher pressure", roles: [5, 1, 0, 5], optionCount: 2 },
    { name: "Cover 2", pressure: "Four rushers", roles: [4, 2, 5, 0], optionCount: 1 },
    { name: "Cover 3", pressure: "Four rushers", roles: [4, 3, 4, 0], optionCount: 3 },
    { name: "Cover 3", pressure: "Five-rusher pressure", roles: [5, 3, 3, 0], optionCount: 3 },
    { name: "Cover 3", pressure: "Simulated pressure · four rushers", roles: [4, 3, 4, 0], optionCount: 3 },
    { name: "Cover 4", pressure: "Four rushers", roles: [4, 4, 3, 0], optionCount: 1 },
  ];
  for (const example of packages) {
    const coverage = coverages.getByRole("button", { name: example.name, exact: true });
    await coverage.focus();
    await coverage.press("Enter");
    await expect(coverage).toHaveAttribute("aria-pressed", "true");
    const pressures = board.getByRole("group", { name: "Pressure package" });
    await expect(pressures.getByRole("button")).toHaveCount(example.optionCount);
    const pressure = pressures.getByRole("button", { name: example.pressure, exact: true });
    await pressure.focus();
    await pressure.press("Space");
    await expect(pressure).toHaveAttribute("aria-pressed", "true");
    const assignments = board.getByRole("button", { name: /Assignments/ });
    await assignments.focus();
    await assignments.press("Enter");
    await expect(board.locator("[data-defender-role]")).toHaveCount(11);
    for (const [index, role] of ["rusher", "deep", "underneath", "man"].entries()) await expect(board.locator(`[data-defender-role="${role}"]`)).toHaveCount(example.roles[index]);
    await expect(board.locator('[data-role-count="total"]')).toHaveText("11");
    await expect(board.getByRole("img")).toHaveAttribute("aria-label", /Total 11 defenders.*Step 2: Assignments/);
    if (example.pressure.startsWith("Simulated")) await expect(board).toContainText("Apparent threats are not additional rushers");
  }
  const windowStep = board.getByRole("button", { name: /Throwing window/ });
  await windowStep.focus();
  await windowStep.press("Space");
  await expect(board.locator("[data-route-overlay]")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("step")).toBe("3");
  await expect(board).toContainText("not a reconstruction, a quarterback progression or a guaranteed open receiver");
  const before = board.getByRole("button", { name: /Before snap/ });
  await before.focus();
  await before.press("Enter");
  await expect(board.locator("[data-route-overlay]")).toHaveCount(0);
  await expect(board.locator("[data-coverage-overlay]")).toHaveCount(0);
  await expect(board).toHaveAttribute("data-step", "0");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("keyboard");
  await expect(board).toContainText("Teaching schematic — not this play’s alignment");
});

for (const fails of [false, true]) {
  test(`clipboard ${fails ? "fallback" : "success"} uses the selected case and ignores a stale response after a history round trip`, async ({ page }) => {
    await page.addInitScript(({ fails }) => {
      const harness = { value: "", delayed: true, complete: () => {} };
      Object.assign(window, { filmClipboard: harness });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: (value: string) => {
          harness.value = value;
          if (!harness.delayed) return fails ? Promise.reject(new Error("Unavailable")) : Promise.resolve();
          return new Promise<void>((resolve, reject) => { harness.complete = () => fails ? reject(new Error("Unavailable")) : resolve(); });
        },
      } });
    }, { fails });
    await page.goto("/film-room?keep=clipboard&play=wilson-cleveland&coverage=cover-3&pressure=five&step=2#film-room");
    const room = page.locator("#film-room");
    const copy = room.getByRole("button", { name: /Copy film link/ });
    await copy.click();
    await room.locator('[data-film-case="hall-miami"]').click();
    await page.goBack();
    await expect(room).toHaveAttribute("data-film", "wilson-cleveland");
    await page.evaluate(() => (window as unknown as { filmClipboard: { complete: () => void } }).filmClipboard.complete());
    await expect(room.getByRole("status")).toBeEmpty();
    await expect(room.getByLabel("Film link", { exact: true })).toHaveCount(0);
    await page.evaluate(() => { (window as unknown as { filmClipboard: { delayed: boolean } }).filmClipboard.delayed = false; });
    await copy.click();
    await expect(room.getByRole("status")).toHaveText(fails ? "Select this link to copy the film case." : "Film link copied.");
    const value = await page.evaluate(() => (window as unknown as { filmClipboard: { value: string } }).filmClipboard.value);
    const shared = new URL(value);
    expect(Object.fromEntries(shared.searchParams)).toEqual({ keep: "clipboard", play: "wilson-cleveland", coverage: "cover-3", pressure: "five", step: "2" });
    expect(shared.hash).toBe("#film-room");
    if (fails) {
      const input = room.getByLabel("Film link", { exact: true });
      await expect(input).toHaveValue(value);
      await input.focus();
      expect(await input.evaluate((element) => (element as HTMLInputElement).selectionEnd! - (element as HTMLInputElement).selectionStart!)).toBe(value.length);
    }
  });
}

for (const media of [
  { id: "wilson-cleveland", label: "Original archival photograph" },
  { id: "sanchez-thanksgiving", label: "AI-generated scene recreation" },
]) {
  test(`${media.id} distinguishes its media provenance and preserves sources after image failure at 320px with doubled text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.route((url) => url.pathname === "/_next/image", (route) => route.abort("failed"));
    await page.goto(`/film-room?play=${media.id}`);
    await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    const room = page.locator("#film-room");
    const scene = room.locator("[data-source-viewer] figure");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toContainText(media.label);
    await expect(scene).toContainText(/unavailable/i);
    if (media.id === "wilson-cleveland") await expect(scene).not.toContainText("AI-generated scene recreation");
    else await expect(scene).toContainText("Editorial illustration. It does not establish the play’s alignment, assignments or player movement.");
    const reference = scene.getByRole("link", { name: /^(?:Photo source|Historical reference):/ });
    await expect(reference).toBeVisible();
    expect(["www.newyorkjets.com", "www.nfl.com"]).toContain(new URL((await reference.getAttribute("href"))!).hostname);
    await expect(room.getByRole("button", { name: /Load source video/ })).toBeVisible();
    await expect(room.getByRole("link", { name: /Watch source video/ })).toBeVisible();
    await expect(room.locator("[data-film-description]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}

for (const view of [{ width: 1280, enlarged: false }, { width: 320, enlarged: false }, { width: 320, enlarged: true }]) {
  test(`film evidence and teaching controls reflow and remain accessible at ${view.width}px${view.enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/film-room?play=elliott-miami&coverage=cover-3&pressure=simulated&step=2");
    if (view.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    const room = page.locator("#film-room");
    const board = page.locator("#scouting-board");
    await board.getByRole("button", { name: /Throwing window/ }).click();
    await expect(board).toHaveAttribute("data-step", "2");
    await expect(room.locator("[data-film-clock]")).toHaveText("Q4");
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      outside: Array.from(document.querySelectorAll("#film-room *")).filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .map((element) => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}px`).slice(0, 8),
      smallButtons: Array.from(document.querySelectorAll("#film-room button")).filter((element) => element.getBoundingClientRect().height < 44)
        .map((element) => element.textContent?.trim()),
    }));
    expect(geometry.width, geometry.outside.join(", ")).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.smallButtons).toEqual([]);
    // Audit from the page origin: a control clipped above the viewport while the
    // later diagram is being inspected must not be confused with a small target.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run(document.getElementById("main"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
  });
}
