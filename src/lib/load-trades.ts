import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TradeLedger } from "./draft-trades";

export async function loadTradeLedger(): Promise<TradeLedger | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "draft-trades.json"), "utf8");
    const ledger = JSON.parse(raw) as TradeLedger;
    if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.trades) || !ledger.trades.length) throw new Error("Unsupported trade ledger");
    return ledger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
