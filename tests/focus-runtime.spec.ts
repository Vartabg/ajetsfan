import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const compile = (file: string) => ts.transpileModule(readFileSync(path.join(process.cwd(), file), "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const packageSource = (name: string, file: string) => readFileSync(path.join(path.dirname(nodeRequire.resolve(`${name}/package.json`)), file), "utf8");
// Exercise the actual client component in React, with routing/style imports
// stubbed and its browser observers/listeners intact. No application test route.
const modules = {
  react: packageSource("react", "cjs/react.production.js"),
  "react/jsx-runtime": packageSource("react", "cjs/react-jsx-runtime.production.js"),
  "react-dom": packageSource("react-dom", "cjs/react-dom.production.js"),
  "react-dom/client": packageSource("react-dom", "cjs/react-dom-client.production.js"),
  scheduler: packageSource("scheduler", "cjs/scheduler.production.js"),
  "focus-shell": compile("src/components/FocusShell.tsx"),
  "@/lib/site-sections": compile("src/lib/site-sections.ts"),
  "@/lib/focus-format": compile("src/lib/focus-format.ts"),
  "next/navigation": 'exports.usePathname=()=>"/morgue";',
  "./IntentLink": 'exports.default=function Link({href,children,className,onClick,...rest}){return require("react").createElement("a",{href,className,onClick,"aria-current":rest["aria-current"]},children)};',
  "./Focus.module.css": 'exports.default={app:"app",rail:"rail",stack:"stack",moment:"moment"};',
  "./FocusRail.module.css": "exports.default={};",
};
const harness = `((modules)=>{
  const cached={};function require(name){if(cached[name])return cached[name].exports;if(!modules[name])throw Error('Missing fixture module '+name);const module={exports:{}};cached[name]=module;new Function('module','exports','require','process',modules[name])(module,module.exports,require,{env:{NODE_ENV:'production'}});return module.exports;}
  const React=require('react'),root=require('react-dom/client').createRoot(document.getElementById('fixture')),Shell=require('focus-shell').default;
  const NativeObserver=window.IntersectionObserver;window.fixtureObserverStarts=0;window.fixtureObserverStops=0;
  window.IntersectionObserver=class extends NativeObserver{constructor(...args){super(...args);window.fixtureObserverStarts++}disconnect(){window.fixtureObserverStops++;super.disconnect()}};
  window.renderFocusFixture=(ids,label='Moment',replaceFirst=false)=>root.render(React.createElement(Shell,{page:'morgue',entries:ids.map(id=>({id,title:label+' '+id,answer:id})),checkedAt:null},
    ids.map(id=>React.createElement(replaceFirst&&id==='first'?'article':'section',{id,key:id,'data-focus-moment':id,className:'moment'},React.createElement('h2',null,label+' '+id),id==='first'?React.createElement(React.Fragment,null,React.createElement('label',null,'Saved draft',React.createElement('input',{id:'draft',defaultValue:'My call'})),React.createElement('div',{'data-inline-media':true},React.createElement('button',{id:'player-control'},'Player control'))):null))));
  window.renderFocusFixture(['first','last']);
})(${JSON.stringify(modules)});`;

type FixtureWindow = Window & { renderFocusFixture: (ids: string[], label?: string, replaceFirst?: boolean) => void; fixtureObserverStarts: number; fixtureObserverStops: number };
async function fixture(page: Page) {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent('<!doctype html><html lang="en"><head><title>Runtime focus moments</title><style>body{margin:0;font:16px system-ui}.rail{position:fixed;top:0;width:160px}main{margin-left:180px}.moment{box-sizing:border-box;min-height:720px;padding:24px}dialog:not([open]){display:none}input,button{min-height:44px}</style></head><body><div id="fixture"></div></body></html>');
  await page.addScriptTag({ content: harness });
  await expect(page.locator("#first")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(1);
}
async function render(page: Page, ids: string[], label = "Moment", replaceFirst = false) {
  await page.evaluate(({ ids, label, replaceFirst }) => (window as unknown as FixtureWindow).renderFocusFixture(ids, label, replaceFirst), { ids, label, replaceFirst });
  await expect(page.getByRole("navigation", { name: "On this page", exact: true }).locator("li")).toHaveCount(ids.length + 1);
}

test("adding and removing runtime moments updates keyboard traversal and observation without moving the reader", async ({ page }) => {
  await fixture(page);
  const before = await page.evaluate(() => scrollY);
  await render(page, ["first", "drives", "last"]);
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(2);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.keyboard.press("j");
  await expect(page.locator("#drives")).toBeInViewport({ ratio: 0.7 });
  const index = page.getByRole("navigation", { name: "On this page", exact: true });
  await expect(index.locator('a[href="#drives"]')).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("k");
  await expect(page.locator("#first")).toBeInViewport({ ratio: 0.7 });
  const beforeRemoval = await page.evaluate(() => scrollY);
  await render(page, ["first", "last"]);
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(3);
  expect(await page.evaluate(() => scrollY)).toBe(beforeRemoval);
  await page.keyboard.press("j");
  await expect(page.locator("#last")).toBeInViewport({ ratio: 0.7 });
  await expect(index.locator('a[href="#last"]')).toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStops)).toBe(2);
});

test("replacing a moment with the same ID observes its new element and keeps keyboard navigation local", async ({ page }) => {
  await fixture(page);
  await page.locator("#first").evaluate((element) => element.setAttribute("data-old-element", ""));
  const before = await page.evaluate(() => scrollY);
  await render(page, ["first", "last"], "Replacement", true);
  await expect(page.locator("article#first")).toBeVisible();
  await expect(page.locator("#first")).not.toHaveAttribute("data-old-element", "");
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStops)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(1);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.keyboard.press("j");
  await expect(page.locator("#last")).toBeInViewport({ ratio: 0.7 });
  await page.keyboard.press("k");
  await expect(page.locator("article#first")).toBeInViewport({ ratio: 0.7 });
  await expect(page.getByRole("navigation", { name: "On this page", exact: true }).locator('a[href="#first"]')).toHaveAttribute("aria-current", "true");
});

test("unchanged IDs retain their observers, input draft and media keyboard controls", async ({ page }) => {
  await fixture(page);
  await page.locator("#draft").focus();
  await render(page, ["first", "last"], "Updated label");
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(1);
  await expect(page.locator("#draft")).toBeFocused();
  await page.keyboard.press("j");
  await expect(page.locator("#draft")).toHaveValue("My callj");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await render(page, ["first", "drives", "last"]);
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(2);
  await expect(page.locator("#draft")).toBeFocused();
  await expect(page.locator("#draft")).toHaveValue("My callj");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.locator("#player-control").focus();
  await render(page, ["first", "last"]);
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).fixtureObserverStarts)).toBe(3);
  await page.keyboard.press("j");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.locator("#player-control")).toBeFocused();
});
