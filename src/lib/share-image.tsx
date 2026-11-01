import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

let fontFiles: Promise<[Buffer, Buffer]> | undefined;
function loadFonts() {
  return fontFiles ??= Promise.all([
    readFile(path.join(process.cwd(), "public", "fonts", "Lexend-Regular.ttf")),
    readFile(path.join(process.cwd(), "public", "fonts", "Lexend-SemiBold.ttf")),
  ]);
}

/** The focus palette (Focus.module.css), written out because the image renderer has no CSS variables. */
const color = { bg: "#f2f4f0", ink: "#10201a", quiet: "#55635b", green: "#125740" };

/**
 * A link preview drawn like a focus moment: the site name, a quiet label, one plain sentence in Lexend,
 * a short detail, and a score or record in a green box where the page has one. No network font or stock photo.
 */
export async function ShareImage({ eyebrow, title, detail, score }: { eyebrow: string; title: string; detail: string; score?: string }) {
  const [regular, semibold] = await loadFonts();
  const long = title.length > 40;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 72px 52px", background: color.bg, color: color.ink, fontFamily: "Lexend" }}>
      <div style={{ display: "flex", fontSize: 38, fontWeight: 600, letterSpacing: -0.7 }}><span>ajets</span><span style={{ color: color.green }}>fan</span></div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
        <span style={{ marginBottom: 18, fontSize: 30, color: color.quiet }}>{eyebrow}</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
          <span style={{ maxWidth: score ? 760 : 1056, fontSize: long ? 64 : 92, fontWeight: 600, lineHeight: 1.05, letterSpacing: long ? -1.8 : -3 }}>{title}</span>
          {score ? <span style={{ display: "flex", padding: "18px 30px", borderRadius: 22, background: color.green, color: color.bg, fontSize: 76, fontWeight: 600, letterSpacing: -2, whiteSpace: "nowrap" }}>{score}</span> : null}
        </div>
        <span style={{ maxWidth: 1000, marginTop: 26, fontSize: 30, lineHeight: 1.4, color: color.quiet }}>{detail}</span>
      </div>
      <span style={{ fontSize: 24, color: color.quiet }}>ajetsfan.com</span>
    </div>,
    { width: 1200, height: 630, fonts: [
      { name: "Lexend", data: regular, weight: 400, style: "normal" },
      { name: "Lexend", data: semibold, weight: 600, style: "normal" },
    ] },
  );
}
