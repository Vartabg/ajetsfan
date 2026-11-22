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

// The week-two participation and roster records name these players on each of the three snaps.
const jetsCore = ["Joe Flacco", "Michael Carter", "Tyler Conklin", "George Fant", "Laken Tomlinson",
  "Connor McGovern", "Alijah Vera-Tucker", "Max Mitchell"];
const brownsCore = ["Isaiah Thomas", "Jordan Elliott", "Jeremiah Owusu-Koramoah", "Anthony Walker",
  "Grant Delpit", "Martin Emerson", "John Johnson", "Greg Newsome", "Denzel Ward"];
const finalSeries = [
  { key: "4155", receivers: ["Corey Davis", "Elijah Moore", "Garrett Wilson"], front: ["Alex Wright", "Chase Winovich"] },
  { key: "4177", receivers: ["Corey Davis", "Braxton Berrios", "Jeff Smith"], front: ["Myles Garrett", "Taven Bryan"] },
  { key: "4199", receivers: ["Braxton Berrios", "Elijah Moore", "Garrett Wilson"], front: ["Myles Garrett", "Taven Bryan"] },
];

async function fullTeams(field: Locator) {
  await expect(field).toBeVisible();
  const marks = field.locator('svg :is([data-unit="O"], [data-unit="X"])[data-player-id]');
  await expect(marks).toHaveCount(22);
  const result = await marks.evaluateAll(elements => ({
    fields: new Set(elements.map(element => element.closest("svg"))).size,
    players: elements.map(element => ({
      id: element.getAttribute("data-player-id")!, unit: element.getAttribute("data-unit")!,
      participant: element.getAttribute("data-participant-id"),
      tag: element.getAttribute("data-tag"), label: element.getAttribute("data-label") ?? "",
      visible: element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && element.getBoundingClientRect().width > 0,
    })),
  }));
  expect(result.fields).toBe(1);
  expect(result.players.every(mark => mark.id.trim() && mark.visible)).toBe(true);
  for (const unit of ["O", "X"]) {
    const side = result.players.filter(mark => mark.unit === unit);
    expect(side).toHaveLength(11);
    expect(new Set(side.map(mark => mark.id)).size).toBe(11);
  }
  return result.players;
}

const playerIds = (marks: Awaited<ReturnType<typeof fullTeams>>) => marks.map(mark => mark.unit + "/" + mark.id).sort();
const duties = (field: Locator, duty: string) => field.locator('svg [data-duty="' + duty + '"]');

function verifiedPlayers(marks: Awaited<ReturnType<typeof fullTeams>>, play: typeof finalSeries[number]) {
  const units = { O: [...jetsCore, ...play.receivers], X: [...brownsCore, ...play.front] };
  const joined: string[] = [];
  for (const [unit, names] of Object.entries(units)) {
    for (const name of names) {
      const matches = marks.filter(mark => mark.unit === unit && mark.label.includes(name));
      expect(matches, play.key + " " + name).toHaveLength(1);
      const mark = matches[0];
      expect(mark.participant).toMatch(/^00-\d{7}$/);
      joined.push([unit, name, mark.participant, mark.id].join("/"));
    }
  }
  expect(new Set(marks.map(mark => mark.participant)).size).toBe(22);
  return joined;
}

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

  test("three Cleveland snaps keep the verified players in both phases and substitute the actual second-down units", async ({ page }) => {
    await page.goto(replay(cleveland, "4155") + "&view=chalk");
    const region = board(page), viewer = page.locator("#replay-viewer");
    const action = frame(region, "action"), setup = frame(region, "snap");
    for (const [index, play] of finalSeries.entries()) {
      if (index) await viewer.getByRole("link", { name: "Next", exact: true }).press("Enter");
      await expectReplaySelection(page, cleveland, play.key);
      const moving = await fullTeams(action);
      const lineup = verifiedPlayers(moving, play);
      expect(await duties(action, "block").count()).toBeGreaterThanOrEqual(5);
      await expect(duties(action, "rush")).toHaveCount(4);
      expect(await duties(action, "cover").count()).toBeGreaterThan(0);
      if (play.key === "4177") {
        await expect(region).toContainText(/empty/i);
        await expect(region).toContainText(/cover 2/i);
        const throwDirection = action.locator('[data-direction-only="right"]');
        await expect(throwDirection).toBeVisible();
        await expect(throwDirection).toContainText(/depth unrecorded/i);
        await expect(throwDirection).toContainText(/target unrecorded/i);
        await expect(action).toContainText(/quarterback hit by Myles Garrett/i);
        await expect(action.locator('[data-path="pass"][data-to], [data-path="incomplete"][data-to], [data-path="carry"]')).toHaveCount(0);
        await expect(action.locator('svg [data-unit="ball"]')).toHaveCount(0);
      } else {
        await expect(region).toContainText(/cover 6/i);
        await expect(path(action, play.key === "4155" ? "incomplete" : "pass")).toBeVisible();
      }
      await phase(region, "Play action").press("ArrowLeft");
      const standing = await fullTeams(setup);
      expect(verifiedPlayers(standing, play)).toEqual(lineup);
      if (play.key === "4177") {
        const y = async (role: string) => setup.locator('svg [data-unit="O"][data-tag="' + role + '"]').evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.top + rect.height / 2;
        });
        expect(standing.filter(mark => mark.unit === "O" && mark.tag === "WR")).toHaveLength(3);
        expect(await y("RB")).toBeLessThan(await y("QB"));
        expect(await y("TE")).toBeLessThan(await y("QB"));
      }
      await phase(region, "At the snap").press("ArrowRight");
    }
    const disclosure = region.locator("summary").filter({ hasText: /^All 22 players$/ });
    await disclosure.press("Enter");
    const key = disclosure.locator("xpath=parent::details");
    await expect(key).toHaveAttribute("open", "");
    await expect(key).toContainText("Garrett Wilson");
    await expect(key).toContainText("Myles Garrett");
    await viewer.getByRole("link", { name: "Previous", exact: true }).press("Enter");
    await expectReplaySelection(page, cleveland, "4177");
    await expect(player(action, "O", "Jeff Smith")).toBeVisible();
    await expect(player(action, "O", "Garrett Wilson")).toHaveCount(0);
  });

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
      await expect(region).toContainText(/schematic|illustrat|example (?:positions|assignments)/i);
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

test("the player picker follows each unit across both phases and distinguishes recorded credits from example assignments", async ({ page }) => {
  await page.goto(exact(cleveland, "4199") + "?view=chalk");
  const region = board(page), action = frame(region, "action"), setup = frame(region, "snap");
  const picker = region.getByRole("combobox", { name: "Follow a player", exact: true });
  const detail = region.locator("[data-player-lookup]").getByRole("status");
  const selected = (field: Locator) => field.locator('svg [data-player-id][data-selected="true"]');
  const focusedTrail = action.locator('svg polyline[data-trail-for][data-focus="true"]');
  const formation = playerIds(await fullTeams(action));
  await expect(picker.locator("optgroup")).toHaveCount(2);
  for (const team of ["Jets", "Browns"]) {
    await expect(picker.locator('optgroup[label*="' + team + '"] option')).toHaveCount(11);
  }
  const receiver = picker.getByRole("option", { name: /#17 Garrett Wilson.*WR/ });
  await expect(receiver).toHaveCount(1);
  const receiverId = (await receiver.getAttribute("value"))!;
  await picker.selectOption(receiverId);
  await expect(detail).toContainText("Garrett Wilson");
  await expect(detail).toContainText(/recorded.*receiver/i);
  await expect(detail).toContainText(/example assignment.*break inside/i);
  await expect(selected(action)).toHaveAttribute("data-player-id", receiverId);
  await expect(selected(action)).toHaveAttribute("data-label", /Garrett Wilson/);
  await expect(focusedTrail).toHaveAttribute("data-trail-for", receiverId);
  expect(playerIds(await fullTeams(action))).toEqual(formation);

  await phase(region, "Play action").press("ArrowLeft");
  await expect(selected(setup)).toHaveAttribute("data-player-id", receiverId);
  const edge = picker.getByRole("option", { name: /#95 Myles Garrett.*DE/ });
  await expect(edge).toHaveCount(1);
  const edgeId = (await edge.getAttribute("value"))!;
  await picker.selectOption(edgeId);
  await expect(selected(setup)).toHaveAttribute("data-player-id", edgeId);
  await expect(selected(setup)).toHaveAttribute("data-label", /Myles Garrett/);
  await expect(detail).toContainText(/Myles Garrett.*example assignment/i);
  await expect(detail).not.toContainText(/recorded|Garrett Wilson/i);
  expect(playerIds(await fullTeams(setup))).toEqual(formation);
  await phase(region, "At the snap").press("ArrowRight");
  await expect(focusedTrail).toHaveAttribute("data-trail-for", edgeId);
  await picker.selectOption({ label: "Entire formation" });
  await expect(selected(action)).toHaveCount(0);
  await expect(focusedTrail).toHaveCount(0);
  expect(playerIds(await fullTeams(action))).toEqual(formation);
});

test("a kickoff assigns the units correctly and its initial payload contains only the selected play’s evidence", async ({ page, request }) => {
  const url = "/replay/" + cleveland + "?view=chalk";
  const html = await page.goto(url);
  expect(html?.ok()).toBe(true);
  const flight = await request.get(url, { headers: { RSC: "1" } });
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  for (const payload of [await html!.text(), await flight.text()]) {
    expect(payload).toContain("C.York kicks 56 yards");
    expect(payload).not.toMatch(/Mi\.Carter left guard to NYJ 32|G\.Wilson for 15 yards, TOUCHDOWN|INTERCEPTED by 21-A\.Davis|31[–-]30|Jeff Smith|00-0035510/);
  }
  const action = frame(board(page), "action");
  const returning = await fullTeams(action);
  await expect(board(page).getByRole("radio", { name: "Before the kick" })).toBeAttached();
  await expect(player(action, "O", "York")).toBeVisible();
  await expect(player(action, "X", "Berrios")).toBeVisible();
  await expect(player(action, "O", "Delpit")).toBeVisible();
  await expect(board(page)).toContainText(/O\s*Browns kick/i);
  await expect(board(page)).toContainText(/X\s*Jets receive/i);
  expect(await drawnRise(path(action, "kick"))).toBeGreaterThan(0);
  expect(await drawnRise(path(action, "return"))).toBeLessThan(0);
  await phase(board(page), "Play action").press("ArrowLeft");
  expect(playerIds(await fullTeams(frame(board(page), "snap")))).toEqual(playerIds(returning));
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
  await fullTeams(action);
  await expect(duties(action, "rush")).toHaveCount(0);
  expect(await duties(action, "cover").count()).toBeGreaterThan(0);
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
  const oldRun = await fullTeams(action);
  await expect(region).toContainText(/play-by-play/i);
  await phase(region, "Play action").press("ArrowLeft");
  expect(playerIds(await fullTeams(frame(region, "snap")))).toEqual(playerIds(oldRun));
  await expect(region).toContainText(/illustrat|example/i);
  await expect(region).toContainText(/alignment|position|spacing|package|formation/i);
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
  await fullTeams(action);
  await expect(region).toContainText("loss of 3 yards");
  await expect(path(action, "pass")).toHaveCount(0);
  await page.goto(exact(cleveland, "4276") + "?view=chalk");
  await expect(player(action, "O", "Brissett")).toBeVisible();
  await expect(player(action, "X", "Davis")).toBeVisible();
  await fullTeams(action);
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
  await expect(region.locator("svg [data-player-id], svg [data-duty]")).toHaveCount(0);
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
