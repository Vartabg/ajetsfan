import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { formatMediaDate } from "../src/lib/media";
import { nextGenSeasonCheck, type NextGenCollection, type NextGenSeason } from "../src/lib/nextgen-stats";

const checkedAt = "2026-10-18T12:41:01.150Z";
const collectionCheck = "2026-10-20T23:00:00.000Z";
const reason = "The latest source files no longer include 2020 passing measurements. Showing the last verified season snapshot.";
const season: NextGenSeason = { year: 2020, phase: "regular", checkedAt, attemptedAt: collectionCheck,
  status: "retained", retentionReason: reason, passing: [], receiving: [], rushing: [], notes: [] };
const collection: NextGenCollection = { schemaVersion: 1, checkedAt: collectionCheck, status: "retained",
  sources: { passing: "https://example.com/passing", receiving: "https://example.com/receiving", rushing: "https://example.com/rushing" }, seasons: [season] };
const file = path.join(process.cwd(), "src/components/AdvancedSeasonStats.tsx");
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const component: { default?: (props: Record<string, unknown>) => React.ReactNode } = {};
runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText,
{ exports: component, URLSearchParams, require: (name: string) => name === "@/lib/media" ? { formatMediaDate }
  : name === "@/lib/pff-public" ? { publicPffGrades: [] }
  : name.endsWith(".module.css") ? { default: {} } : nodeRequire(name) });

test("a retained season shows its source gap and original check instead of another season's fresh date", async ({ page }) => {
  const props = nextGenSeasonCheck(collection, 2020);
  expect(props.checkedAt).toBe(checkedAt);
  const markup = renderToStaticMarkup(createElement(component.default!, { year: 2020, phase: "regular", ...props }));
  await page.setContent(`<html lang="en"><head><title>Historical tracking data</title></head><body><main>${markup}</main></body></html>`);
  await expect(page.getByRole("status")).toContainText(reason);
  await expect(page.getByRole("status")).toContainText(`Last verified ${formatMediaDate(checkedAt)}`);
  await expect(page.locator("[data-nextgen-stats]")).toContainText(`Updated ${formatMediaDate(checkedAt)}`);
  await expect(page.locator("[data-nextgen-stats]")).not.toContainText(`Updated ${formatMediaDate(collectionCheck)}`);
});

test("legacy collection outages stay visible while a fresh season in a mixed collection stays fresh", () => {
  const legacy = { ...collection, seasons: [{ year: 2020, phase: "regular" as const, passing: [], receiving: [], rushing: [], notes: [] }] };
  expect(nextGenSeasonCheck(legacy, 2020).nextgen?.status).toBe("retained");
  const current = { ...season, year: 2026, status: "ready" as const, checkedAt: collectionCheck, retentionReason: undefined };
  expect(nextGenSeasonCheck({ ...collection, seasons: [season, current] }, 2026).nextgen?.status).toBe("ready");
  expect(nextGenSeasonCheck({ ...collection, seasons: [season, current] }, 2026).checkedAt).toBe(collectionCheck);
});
