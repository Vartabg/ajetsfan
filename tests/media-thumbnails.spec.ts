import { test, expect } from "@playwright/test";
import { mediaCollection } from "../src/lib/media-catalog";
import { mediaTitleCardPath } from "../src/lib/media-asset-paths.mjs";

for (const kind of ["article", "audio"] as const) {
  test(`the ${kind} fallback renders a full-resolution factual title card`, async ({ request }) => {
    const item = mediaCollection.items.find((item) => item.kind === kind)!;
    const response = await request.get(mediaTitleCardPath(item));
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1600);
    expect(bytes.readUInt32BE(20)).toBe(kind === "audio" ? 1600 : 900);
  });
}

test("unknown media, obsolete title versions and arbitrary image URLs cannot generate assets", async ({ request }) => {
  const item = mediaCollection.items[0];
  const path = mediaTitleCardPath(item);
  expect((await request.get(path.replace(/\/[a-f0-9]{16}$/, "/0000000000000000"))).status()).toBe(404);
  expect((await request.get("/api/media/thumbnail/unknown/0000000000000000")).status()).toBe(404);
  expect((await request.get("/api/media/image/unknown/0000000000000000?url=https://example.com/picture.png")).status()).toBe(404);
});
