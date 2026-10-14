import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { formatDate, type CurrentSnapshot, type FinalGame } from "../src/lib/current";
import { readDrives, type RuntimeDrives } from "../src/lib/drives";
import { pageMetadata } from "../src/lib/site";
import { confirmedDriveGame } from "../src/lib/drive-game-page.mjs";
import { validateRuntimeDrives } from "../src/lib/postgame-evidence.mjs";
import type { GamePageEdition } from "../src/lib/load-game-page";
type RouteProps = { params: Promise<{ id: string }> };

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const compile = (file: string) => ts.transpileModule(read(file), { fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const packageSource = (name: string, file: string) => readFileSync(path.join(path.dirname(nodeRequire.resolve(`${name}/package.json`)), file), "utf8");
const snapshot = JSON.parse(read("public/data/current.json")) as CurrentSnapshot;
const next = snapshot.schedule.filter((game) => game.status === "scheduled").sort((left, right) => left.date.localeCompare(right.date))[0]!;
const file = JSON.parse(read(`public/data/drives/${snapshot.season}.json`)) as RuntimeDrives;
const donor = Object.values(file.games).find((rows) => rows.some((row) => row[0] === 1))!;
const final: FinalGame = { ...next, status: "final", jetsScore: 20, oppScore: 17, outcome: "win" };
const checkedAt = new Date(Math.max(Date.parse(`${final.date}T23:59:59Z`), Date.parse(snapshot.checkedAt), Date.parse(file.checkedAt)) + 3_600_000).toISOString();
const current = { ...snapshot, checkedAt, schedule: snapshot.schedule.map((game) => game.id === final.id ? final : game) };
const games = { [final.id]: donor };
const published = validateRuntimeDrives({ ...file, checkedAt, attemptedAt: checkedAt, status: "ready", asset: null, games,
  finals: { [final.id]: { date: final.date, jetsScore: 20, oppScore: 17 } },
  pendingGameIds: current.schedule.filter((game) => game.status === "final" && !Object.hasOwn(games, game.id)).map((game) => game.id) }) as RuntimeDrives;
const edition: GamePageEdition = { kind: "drives", game: final, file: published, drives: readDrives(published, final.id)! };

function serverModule(file: string, imports: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(compile(file), { exports, require: (name: string) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === "react" || name === "react/jsx-runtime") return nodeRequire(name);
    if (name === "next/navigation") return { notFound: () => { throw Error("404"); } };
    return { default: () => null };
  } });
  return exports;
}

test("the real loader, game page, metadata and share image publish a new final without WP analysis", async () => {
  let curvesRead = 0;
  const loader = serverModule("src/lib/load-game-page.ts", {
    "server-only": {}, "./load-published-pages": { loadPublishedGame: async () => undefined },
    "./load-football": { loadFootballState: async () => ({ edition: { current } }) },
    "./load-drives": { loadDrivesSeason: async () => published }, "./drives": { readDrives },
    "./drive-game-page.mjs": { confirmedDriveGame },
  }).loadGamePage as (id: string) => Promise<GamePageEdition | null>;
  const actual = await loader(final.id);
  expect(actual?.kind).toBe("drives");
  expect(actual?.game).toEqual(final);
  expect(await loader("unknown")).toBeNull();
  expect(await loader(current.schedule.find((game) => game.status === "scheduled")!.id)).toBeNull();
  const imports = { "@/lib/load-game-page": { loadGamePage: loader }, "@/lib/current": { formatDate },
    "@/lib/site": { pageMetadata }, "./DriveGameReport": { default: "drive-game-report" },
    "@/lib/load-games": { loadCurve: async () => { curvesRead++; throw Error("No published WP analysis"); } } };
  const route = serverModule("src/app/games/[id]/page.tsx", imports);
  const props: RouteProps = { params: Promise.resolve({ id: final.id }) };
  const rendered = await (route.default as (props: RouteProps) => Promise<{ type: string; props: Record<string, unknown> }>)(props);
  expect(rendered.type).toBe("drive-game-report");
  expect(rendered.props.game).toEqual(final);
  expect(rendered.props.drives).toEqual(edition.drives);
  expect(curvesRead).toBe(0);
  const metadata = await (route.generateMetadata as (props: RouteProps) => Promise<{ title: string; description: string }>)(props);
  expect(metadata.title).toContain("Jets 20–17");
  expect(metadata.description).toContain("Confirmed final score and verified drive chart");
  expect(metadata.description).toContain("analysis are pending");
  expect(metadata.description).not.toContain("model win-probability curve");
  const image = serverModule("src/app/games/[id]/opengraph-image.tsx", { ...imports,
    "@/lib/share-image": { ShareImage: (props: Record<string, unknown>) => props } });
  expect(image.dynamic).toBe("force-dynamic");
  const cover = await (image.default as (props: RouteProps) => Promise<{ score: string; detail: string }>)(props);
  expect(cover.score).toBe("20–17");
  expect(cover.detail).toContain("Final · Verified drives");
  expect(cover.detail).not.toContain("OT");
});

const cssModule = (prefix: string) => `exports.default=new Proxy({},{get:(_,key)=>'${prefix}-'+key});`;
const modules = {
  react: packageSource("react", "cjs/react.production.js"), "react/jsx-runtime": packageSource("react", "cjs/react-jsx-runtime.production.js"),
  "react-dom": packageSource("react-dom", "cjs/react-dom.production.js"), "react-dom/client": packageSource("react-dom", "cjs/react-dom-client.production.js"),
  scheduler: packageSource("scheduler", "cjs/scheduler.production.js"), report: compile("src/app/games/[id]/DriveGameReport.tsx"),
  "@/components/FocusShell": compile("src/components/FocusShell.tsx"), "@/components/FocusMoment": compile("src/components/FocusMoment.tsx"),
  "@/components/DriveChart": compile("src/components/DriveChart.tsx"), "@/lib/current": compile("src/lib/current.ts"),
  "@/lib/drives": compile("src/lib/drives.ts"), "@/lib/teams": compile("src/lib/teams.ts"),
  "@/lib/site-sections": compile("src/lib/site-sections.ts"), "@/lib/focus-format": compile("src/lib/focus-format.ts"),
  "next/navigation": 'exports.usePathname=()=>"/games/new-final";',
  "@/components/IntentLink": 'exports.default=({href,children,className,onClick})=>require("react").createElement("a",{href,className,onClick},children);',
  "./IntentLink": 'exports.default=({href,children,className,onClick,...rest})=>require("react").createElement("a",{href,className,onClick,"aria-current":rest["aria-current"]},children);',
  "@/components/SeasonReturn": 'exports.default=({fallback,fallbackLabel,className})=>require("react").createElement("a",{href:fallback,className},fallbackLabel);',
  "../../focus-fonts": 'exports.focusFonts="";', "@/components/Focus.module.css": cssModule("focus"), "./Focus.module.css": cssModule("focus"),
  "./FocusRail.module.css": cssModule("rail"), "./DriveChart.module.css": cssModule("drive"), "./page.module.css": cssModule("game"),
};
const harness = `((modules,props)=>{const cached={};function require(name){if(cached[name])return cached[name].exports;if(!modules[name])throw Error('Missing fixture module '+name);const module={exports:{}};cached[name]=module;new Function('module','exports','require','process',modules[name])(module,module.exports,require,{env:{NODE_ENV:'production'}});return module.exports;}const React=require('react');require('react-dom/client').createRoot(document.getElementById('fixture')).render(React.createElement(require('report').default,props));})(${JSON.stringify(modules)},${JSON.stringify({ game: final, drives: edition.drives, checkedAt, source: published.source })});`;
async function reportPage(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  const scopedCss = (file: string, prefix: string) => {
    const globals: string[] = [];
    const raw = read(file).replace(/:global\(([^)]+)\)/g, (_, selector: string) => { globals.push(selector); return `__GLOBAL_${globals.length - 1}__`; });
    return raw.replace(/\.([A-Za-z_-][\w-]*)/g, `.${prefix}-$1`).replace(/__GLOBAL_(\d+)__/g, (_, index: string) => globals[Number(index)]!);
  };
  const css = [["src/components/Focus.module.css", "focus"], ["src/components/FocusRail.module.css", "rail"], ["src/components/DriveChart.module.css", "drive"], ["src/app/games/[id]/page.module.css", "game"]].map(([file, prefix]) => scopedCss(file!, prefix!)).join("\n");
  await page.setContent(`<html lang="en"><head><title>Verified postgame drives</title><style>html{--bg:#eee8d9;--raise:#e5dfd2;--ink:#15231d;--quiet:#56635b;--faint:#bac5bc;--green:#006b48;--focus-display:system-ui;--focus-text:system-ui;--font-mono:monospace}body{margin:0;font:16px system-ui}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${css}</style></head><body><div id="fixture"></div></body></html>`);
  await page.addScriptTag({ content: harness });
  await expect(page.locator("#final-heading")).toBeVisible();
}

test("the real pending-analysis report shows confirmed scores and interactive verified drives", async ({ page }) => {
  await reportPage(page, 1280);
  await expect(page.getByRole("group", { name: `Final score: Jets 20, ${final.opponentDisplay} 17` })).toBeVisible();
  await expect(page.locator("[data-game-analysis-pending]")).toContainText("analysis are pending");
  expect(await page.locator("#turn, #play, #numbers").count()).toBe(0);
  const drives = page.locator("#drives");
  const jets = edition.drives.filter((drive) => drive.jets);
  await expect(drives.locator("[data-drive-chart] > [data-kind]")).toHaveCount(jets.length);
  await expect(drives.locator("ol.sr-only li").first()).toContainText("Jets, Q1");
  const toggle = drives.getByRole("button", { name: /Show .* drives too/ });
  await toggle.click();
  await expect(drives.locator("[data-drive-chart] > [data-kind]")).toHaveCount(edition.drives.length);
  await expect(drives.getByRole("button", { name: /Hide .* drives/ })).toHaveAttribute("aria-pressed", "true");
  await expect(drives.locator(`time[datetime="${checkedAt}"]`)).toHaveCount(1);
  await expect(drives.getByRole("link", { name: "nflverse play-by-play" })).toHaveAttribute("href", published.source);
});

test("the pending-analysis report reflows on a 320px phone with the chart reachable in place", async ({ page }) => {
  await reportPage(page, 320);
  await page.getByRole("link", { name: "See every drive" }).click();
  await expect(page.locator("#drives-heading")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator("#drives [data-drive-chart]")).toBeVisible();
  await expect(page.locator("[data-game-analysis-pending]")).toContainText("Final score confirmed");
});
