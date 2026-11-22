import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const cleveland = "2022_02_NYJ_CLE";
const read = (game: string) => "/replay/" + game + "/read";
const series = read(cleveland) + "?series=cleveland-15";
const wilson = "00-0037740";
const garrett = "00-0033868";
const reader = (page: Page) => page.locator("#drive-reader");
const link = (page: Page, name: string) => reader(page).getByRole("link", { name, exact: true });
const historyMark = (page: Page, key: string) => reader(page).locator('svg [data-prior-throw="' + key + '"]');
type Phase = "snap" | "action";

async function at(page: Page, key: string, phase: Phase, follow?: string) {
  await expect(page).toHaveURL(url => url.pathname === read(cleveland) && url.searchParams.get("series") === "cleveland-15" &&
    (url.searchParams.get("play") ?? "4155") === key && (url.searchParams.get("phase") ?? "snap") === phase &&
    (follow === undefined || url.searchParams.get("follow") === follow));
  await expect(reader(page)).toBeVisible();
}

async function lineup(region: Locator, phase: Phase, verified = true) {
  await expect(region.locator("svg[data-full-field]")).toHaveCount(1);
  const field = region.locator('svg[data-full-field="' + phase + '"]');
  await expect(field).toBeVisible();
  for (const unit of ["O", "X"]) await expect(field.locator('[data-unit="' + unit + '"][data-player-id]')).toHaveCount(11);
  const marks = await field.locator("[data-player-id]").evaluateAll(elements => elements.map(el => ({
    unit: el.getAttribute("data-unit"), slot: el.getAttribute("data-player-id"),
    person: el.getAttribute("data-participant-id"), visible: el.getBoundingClientRect().width > 0 && el.checkVisibility(),
  })));
  expect(marks).toHaveLength(22);
  expect(marks.every(mark => mark.visible)).toBe(true);
  expect(new Set(marks.map(mark => mark.unit + "/" + mark.slot)).size).toBe(22);
  if (verified) {
    expect(marks.every(mark => mark.person && /^00-\d{7}$/.test(mark.person))).toBe(true);
    expect(new Set(marks.map(mark => mark.person)).size).toBe(22);
  }
  return marks.map(mark => [mark.unit, mark.slot, mark.person].join("/")).sort();
}

async function score(page: Page, jets: number, browns: number, phase: Phase) {
  const panel = reader(page).locator("[data-study-score]");
  await expect(panel.locator('[data-team="NYJ"] strong')).toHaveText(String(jets));
  await expect(panel.locator('[data-team="CLE"] strong')).toHaveText(String(browns));
  await expect(panel.getByText(phase === "snap" ? "Score before this play" : "Score after this play", { exact: true })).toBeVisible();
}

async function drawnPath(region: Locator, kind: string) {
  const path = region.locator('svg [data-path="' + kind + '"]');
  await expect(path).toHaveCount(1);
  await expect(path).toHaveCSS("visibility", "visible");
  await expect(path).not.toHaveCSS("stroke", "none");
  // A straight vertical kick has a zero-width bounding box even when its stroke is drawn.
  expect(await path.evaluate(el => (el as SVGPathElement).getTotalLength())).toBeGreaterThan(0);
}

async function documents(request: APIRequestContext, url: string) {
  const [html, flight] = await Promise.all([request.get(url), request.get(url, { headers: { RSC: "1" } })]);
  expect(html.status()).toBe(200);
  expect(html.headers()["content-type"]).toContain("text/html");
  expect(flight.status()).toBe(200);
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  return Promise.all([html, flight].map(async response => (await response.text()).replaceAll('\\"', '"').replaceAll("&quot;", '"')));
}

const futureNames = /Myles Garrett|Taven Bryan|Braxton Berrios|Jeff Smith/i;
const futureAccounts = /G\.Wilson for 15 yards, TOUCHDOWN|\bFlacco kneels to NYJ 49|INTERCEPTED by 21-A\.Davis|G\.Zuerlein extra point is GOOD|\b31[–-]30\b/i;

test("the opening document and Flight response contain only first-down setup, and neither reveal nor game deck is prefetched", async ({ page, request }) => {
  const premature: string[] = [];
  page.on("request", r => {
    const url = new URL(r.url());
    if (url.pathname.endsWith("/frames") || (url.pathname === read(cleveland) && url.searchParams.get("phase") === "action")) premature.push(r.url());
  });
  await page.goto(series);
  await at(page, "4155", "snap");
  await score(page, 24, 30, "snap");
  await lineup(reader(page), "snap");
  for (const payload of await documents(request, series)) {
    expect(payload).toContain("Elijah Moore");
    expect(payload).not.toMatch(futureNames);
    expect(payload).not.toMatch(futureAccounts);
    expect(payload).not.toMatch(/incomplete short left to 8-E\.Moore|\b(?:COVER_[26]|Cover [26])\b|four pass rushers|4 pass rushers|\b2\.969 seconds\b/i);
    expect(payload).not.toMatch(/"(?:primaryRoute|route)"\s*:\s*"(?:OUT|POST)"|"(?:passLength|pass_length)"\s*:\s*"short"|"postWp"\s*:\s*0\.315|"(?:rushers|number_of_pass_rushers)"\s*:\s*4/i);
    expect(payload).not.toMatch(/"(?:quarterbackHitBy|qb_hit_1_player_id)"\s*:\s*"00-0033868"|\b30[–-]30\b/i);
  }
  const laterSetup = [
    { key: "4177", credit: /Quarterback hit by Myles Garrett|Myles Garrett is credited with the quarterback hit|incomplete short right \[95-M\.Garrett\]|"quarterbackHitBy"\s*:\s*"00-0033868"|\bCOVER_2\b/i },
    { key: "4199", credit: /Garrett Wilson catches a touchdown pass|"(?:primaryRoute|route)"\s*:\s*"POST"|G\.Wilson for 15 yards, TOUCHDOWN|"after"\s*:\s*\[30,\s*30\]/i },
  ];
  for (const { key, credit } of laterSetup) {
    for (const payload of await documents(request, series + "&play=" + key)) {
      expect(payload).not.toMatch(credit);
      expect(payload).not.toMatch(futureAccounts);
    }
  }
  await expect(reader(page).locator("svg [data-duty], svg [data-path], svg [data-prior-throw]")).toHaveCount(0);
  await link(page, "Reveal play").hover();
  await page.waitForLoadState("networkidle");
  expect(premature).toEqual([]);
});

test("six series states preserve player slots, follow Wilson through the substitution, and stop at the tying touchdown", async ({ page }) => {
  const deck: string[] = [];
  page.on("request", req => { if (new URL(req.url()).pathname.endsWith("/frames")) deck.push(req.url()); });
  await page.goto(series);
  await reader(page).getByRole("combobox", { name: "Follow a player" }).selectOption(wilson);
  let firstEndpoint = "";
  for (const key of ["4155", "4177", "4199"]) {
    await at(page, key, "snap", wilson);
    const region = reader(page);
    await score(page, 24, 30, "snap");
    const before = await lineup(region, "snap");
    const selected = region.locator('svg [data-participant-id="' + wilson + '"]');
    await expect(selected).toHaveCount(key === "4177" ? 0 : 1);
    if (key === "4177") await expect(region.locator("[data-player-lookup] [role=status]")).toContainText(/off the field|off this snap/i);
    else await expect(selected).toHaveAttribute("data-selected", "true");
    if (key !== "4155") {
      await expect(historyMark(page, "4155")).toHaveCount(1);
      const point = await historyMark(page, "4155").getAttribute("data-to");
      expect(point).toMatch(/-?\d+(\.\d+)?,-?\d/);
      if (firstEndpoint) expect(point).toBe(firstEndpoint);
      else firstEndpoint = point!;
    }
    await expect(historyMark(page, "4177")).toHaveCount(0);
    await link(page, "Reveal play").focus();
    await expect(link(page, "Reveal play")).toBeFocused();
    await page.keyboard.press("Enter");
    await at(page, key, "action", wilson);
    expect(await lineup(region, "action")).toEqual(before);
    await score(page, key === "4199" ? 30 : 24, 30, "action");
    if (key === "4155") await drawnPath(region, "incomplete");
    if (key === "4177") {
      await expect(region).toContainText(/M(?:yles|\.)\s*Garrett/i);
      await expect(region.locator('[data-direction-only="right"]')).toContainText(/depth unrecorded|unknown depth/i);
      await expect(region.locator('svg [data-path="incomplete"], svg [data-path="pass"]')).toHaveCount(0);
    }
    if (key === "4199") {
      await expect(region).toContainText(/touchdown/i);
      await drawnPath(region, "pass");
      await expect(link(page, "Next snap")).toHaveCount(0);
    } else await link(page, "Next snap").click();
  }
  await link(page, "Replay series").click();
  await at(page, "4155", "snap");
  expect(new URL(page.url()).searchParams.has("follow")).toBe(false);
  await score(page, 24, 30, "snap");
  await expect(reader(page).locator("svg [data-prior-throw]")).toHaveCount(0);
  expect(deck).toEqual([]);
});

test("rewind, reload and a shared follow query cannot identify a player before his first appearance", async ({ page, request }) => {
  const second = series + "&play=4177&follow=" + garrett;
  await page.goto(second);
  await at(page, "4177", "snap", garrett);
  await expect(reader(page).locator('svg [data-participant-id="' + garrett + '"]')).toHaveAttribute("data-selected", "true");
  await link(page, "Previous snap").press("Enter");
  await at(page, "4155", "action");
  await expect(reader(page)).not.toContainText(futureNames);
  const explicit = series + "&play=4155&phase=action&follow=" + garrett;
  for (const payload of await documents(request, explicit)) {
    expect(payload).not.toMatch(futureNames);
    expect(payload).not.toMatch(futureAccounts);
  }
  await page.goBack();
  await at(page, "4177", "snap", garrett);
  await page.reload();
  await at(page, "4177", "snap", garrett);
  await expect(reader(page).locator('svg [data-participant-id="' + garrett + '"]')).toHaveAttribute("data-selected", "true");
  await page.goForward();
  await at(page, "4155", "action");
  await expect(reader(page)).not.toContainText(futureNames);
});

test.describe("native drive study", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });

  test("the GET player picker, reveal and previous/next links work on a phone without JavaScript", async ({ page }) => {
    await page.goto(series);
    const form = reader(page).locator('form[method="get" i]').filter({ has: page.locator('select[name="follow"]') });
    const pick = form.locator('select[name="follow"]');
    await expect(pick).toBeVisible();
    await pick.selectOption(wilson);
    await form.getByRole("button", { name: "Follow", exact: true }).press("Enter");
    await at(page, "4155", "snap", wilson);
    await expect(reader(page).locator('svg [data-participant-id="' + wilson + '"]')).toHaveAttribute("data-selected", "true");
    await link(page, "Reveal play").press("Enter");
    await at(page, "4155", "action", wilson);
    await link(page, "Next snap").press("Enter");
    await at(page, "4177", "snap", wilson);
    await expect(reader(page)).toContainText(/off the field|off this snap/i);
    await link(page, "Previous snap").press("Enter");
    await at(page, "4155", "action", wilson);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("the directory opens the three-snap series, while regular replay and exact play keep their selected snap", async ({ page }) => {
  await page.goto("/replay");
  await page.getByRole("link", { name: "Read three downs at Cleveland’s 15", exact: true }).click();
  await at(page, "4155", "snap");
  for (const [url, key] of [["/replay/" + cleveland + "?play=4177&pace=all", "4177"], ["/plays/" + cleveland + "/4199", "4199"]]) {
    await page.goto(url);
    const open = page.getByRole("link", { name: "Read the drive", exact: true });
    await expect(open).toBeVisible();
    const href = new URL((await open.getAttribute("href"))!, page.url());
    expect(href.pathname).toBe(read(cleveland));
    expect(href.searchParams.get("play")).toBe(key);
    expect(href.searchParams.has("series")).toBe(false);
    await open.click();
    await expect(reader(page).locator('svg[data-full-field="snap"]')).toBeVisible();
  }
});

test("generic reading retains a ruling, a kickoff, and incomplete historical participation", async ({ page }) => {
  await page.goto(read(cleveland) + "?play=4018&phase=action");
  await expect(reader(page)).toContainText(/neutral zone infraction/i);
  await expect(reader(page).locator("svg [data-path]")).toHaveCount(0);

  await page.goto(read("2026_10_BUF_NYJ") + "?play=40&phase=action");
  await lineup(reader(page), "action", false);
  await expect(reader(page)).toContainText(/G\.?\s*Dortch/i);
  await drawnPath(reader(page), "kick");

  await page.goto(read(cleveland) + "?play=4255&follow=" + wilson);
  const unavailable = reader(page).locator("[data-player-lookup] [role=status]");
  await expect(unavailable).toContainText("Garrett Wilson");
  await expect(unavailable).toContainText(/unavailable|unverified|unconfirmed|unknown|not (?:recorded|verified)|cannot confirm/i);
  await expect(unavailable).not.toContainText(/off the field|off this snap/i);

  await page.goto(read("1999_01_NE_NYJ") + "?play=118");
  await lineup(reader(page), "snap", false);
  await expect(reader(page).locator("svg [data-participant-id]")).toHaveCount(0);
  await link(page, "Reveal play").click();
  await expect(reader(page)).toContainText(/S\.?\s*Jefferson/i);
});

test("generic history moves the displayed line of scrimmage and omits an endpoint outside the field", async ({ page }) => {
  await page.goto(read("2026_10_BUF_NYJ") + "?play=2541");
  const region = reader(page);
  await lineup(region, "snap", false);
  // Kincaid's previous 21-air-yard catch is now 33 yards behind this new line at the Jets' 8.
  await expect(region).toContainText(/Kincaid/i);
  await expect(historyMark(page, "2511")).toHaveCount(0);
});

test("unpublished games, missing play IDs, and a real play outside the requested series return 404", async ({ request }) => {
  for (const url of [read("2022_02_NYJ_ZZZ"), read(cleveland) + "?play=999999", series + "&play=3931"]) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(404);
    expect(await response.text()).not.toMatch(futureAccounts);
  }
});
