import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

let fontFiles: Promise<[Buffer, Buffer]> | undefined;
function loadFonts() {
  return fontFiles ??= Promise.all([
    readFile(path.join(process.cwd(), "public", "fonts", "Anton-Regular.ttf")),
    readFile(path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf")),
  ]);
}

/** An original newspaper cover; no network font or stock-photo dependency. */
export async function ShareImage({ eyebrow, title, detail, score }: { eyebrow: string; title: string; detail: string; score?: string }) {
  const [anton, geist] = await loadFonts();
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", background: "#eee8d9", color: "#15231d", display: "flex", flexDirection: "column", padding: "38px 54px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #15231d", paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}><span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 48, borderRadius: "50%", background: "#15231d", color: "#eee8d9", fontFamily: "Anton", fontSize: 28 }}>AF</span><span style={{ fontSize: 35, fontFamily: "Anton" }}>THE BACK PAGE</span></div>
        <span style={{ fontSize: 18, letterSpacing: 3 }}>AN INDEPENDENT JETS FAN PUBLICATION</span>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", paddingTop: 20, paddingBottom: 20 }}>
        <span style={{ fontSize: 21, letterSpacing: 4, color: "#006b48", textTransform: "uppercase", marginBottom: 18 }}>{eyebrow}</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 30 }}>
          <span style={{ fontFamily: "Anton", fontSize: title.length > 40 ? 72 : 104, lineHeight: 1.08, letterSpacing: -2, maxWidth: score ? 730 : 1090, textTransform: "uppercase" }}>{title}</span>
          {score ? <span style={{ fontFamily: "Anton", fontSize: 90, background: "#006b48", color: "#eee8d9", padding: "24px 20px", whiteSpace: "nowrap" }}>{score}</span> : null}
        </div>
        <span style={{ fontSize: 27, marginTop: 25, lineHeight: 1.35 }}>{detail}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #15231d", paddingTop: 18 }}>
        <span style={{ fontSize: 23, fontFamily: "Anton" }}>AJETSFAN.COM</span>
        <span style={{ fontSize: 20 }}>Scores. Plays. Probability.</span>
      </div>
    </div>,
    { width: 1200, height: 630, fonts: [
      { name: "Anton", data: anton, weight: 400, style: "normal" },
      { name: "Geist", data: geist, weight: 400, style: "normal" },
    ] },
  );
}
