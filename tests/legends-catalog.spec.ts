import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { legends, legendBySlug, filterLegends } from "../src/lib/legends";

const ring = ["weeb-ewbank", "winston-hill", "joe-klecko", "curtis-martin", "don-maynard", "joe-namath", "larry-grantham", "freeman-mcneil", "gerry-philbin", "al-toon", "mark-gastineau", "wesley-walker", "marty-lyons", "wayne-chrebet", "leon-hess", "emerson-boozer", "matt-snell", "kevin-mawae", "dbrickashaw-ferguson", "nick-mangold", "darrelle-revis"];
const hall = ["steve-atwater", "weeb-ewbank", "alan-faneca", "brett-favre", "winston-hill", "joe-klecko", "ty-law", "ronnie-lott", "curtis-martin", "kevin-mawae", "don-maynard", "art-monk", "joe-namath", "bill-parcells", "ed-reed", "darrelle-revis", "john-riggins", "jason-taylor", "ladainian-tomlinson", "ron-wolf"];

test("the people catalog has the verified Ring, Canton and retired-number membership", () => {
  expect(legends).toHaveLength(34);
  expect(new Set(legends.map((person) => person.slug)).size).toBe(34);
  expect(legends.filter((person) => person.ringYear).map((person) => person.slug).sort()).toEqual(ring.sort());
  expect(legends.filter((person) => person.hallYear).map((person) => person.slug).sort()).toEqual(hall.sort());
  expect(Object.fromEntries(legends.filter((person) => person.retiredNumber).map((person) => [person.slug, person.retiredNumber]))).toEqual({
    "joe-namath": "12", "don-maynard": "13", "curtis-martin": "28", "joe-klecko": "73", "dennis-byrd": "90",
  });
  expect(legendBySlug("jason-taylor")).toMatchObject({ start: 2010, end: 2010, hallYear: 2017 });
  expect(legendBySlug("darrelle-revis")?.jetsYears).toMatch(/2015.*2016/);
  expect(legendBySlug("curtis-martin")?.jetsYears).toContain("2005");
  expect(legendBySlug("dennis-byrd")?.hallYear).toBeUndefined();
});

test("every story has safe sources, valid connections and its own verified photo or a named gap", () => {
  for (const person of legends) {
    expect(person.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(person.start).toBeLessThanOrEqual(person.end);
    expect(person.intro.length).toBeGreaterThan(150);
    expect(person.moments.length).toBeGreaterThan(0);
    expect(person.sources.length).toBeGreaterThan(0);
    for (const source of [...person.sources, ...(person.photo ? [{ url: person.photo.sourceUrl }] : [])]) {
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(url.username + url.password).toBe("");
      expect(url.hostname).toMatch(/(^|\.)(newyorkjets\.com|profootballhof\.com|nfl\.com|jefferson\.edu|virginia\.edu|packers\.com)$/);
    }
    for (const slug of person.related) {
      expect(slug).not.toBe(person.slug);
      expect(legendBySlug(slug)).toBeDefined();
    }
    for (const link of person.archive) expect(link.href).toMatch(/^\/seasons\/(1999|20\d\d)$/);
    if (person.photo) {
      expect(person.photo.src).toMatch(/^\/legends\/(?:enhanced\/)?[a-z0-9-]+\.(webp|jpg|png)$/);
      expect(existsSync(path.join(process.cwd(), "public", person.photo.src))).toBe(true);
      expect(person.photo.alt).toContain(person.name);
    } else expect(person.slug).toBe("leon-hess");
  }
  expect(filterLegends({ honor: "hall", era: "1960s" }).map((person) => person.slug).sort()).toEqual(["don-maynard", "joe-namath", "weeb-ewbank", "winston-hill"]);
  expect(filterLegends({ q: "  Wayne  " }).map((person) => person.slug)).toEqual(["wayne-chrebet"]);
});

test("altered portraits meet the shared format and retain their original reference", async () => {
  const altered = legends.filter((person) => person.photo?.treatment);
  expect(altered).toHaveLength(34);
  for (const person of altered) {
    const photo = person.photo!;
    expect(["ai-enhanced", "ai-generated"]).toContain(photo.treatment);
    expect(photo.alt).toMatch(photo.treatment === "ai-enhanced" ? /AI-enhanced/i : /AI-generated/i);
    const image = await sharp(path.join(process.cwd(), "public", photo.src)).metadata();
    expect(image.width).toBe(960);
    expect(image.height).toBe(1200);
    expect(image.width! * 5).toBe(image.height! * 4);
    if (photo.treatment === "ai-enhanced") expect(photo.originalSrc).toBeDefined();
    if (photo.originalSrc) {
      expect(photo.originalSrc).toMatch(/^\/legends\/(?:originals\/)?[a-z0-9-]+\.(webp|jpe?g|png)$/);
      expect(photo.originalSrc).not.toBe(photo.src);
      expect(existsSync(path.join(process.cwd(), "public", photo.originalSrc))).toBe(true);
    }
  }
});
