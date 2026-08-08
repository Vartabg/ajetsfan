"use client";

import { useMemo, useState } from "react";
import type { Board, Game } from "@/lib/games";
import { clockLabel } from "@/lib/games";
import SwingCurve from "./SwingCurve";
import styles from "./Boards.module.css";

const ERAS = [
  { id: "all", label: "All time", test: () => true },
  { id: "2020s", label: "2020s", test: (g: Game) => g.season >= 2020 },
  { id: "2010s", label: "2010s", test: (g: Game) => g.season >= 2010 && g.season < 2020 },
  { id: "2000s", label: "2000s", test: (g: Game) => g.season >= 2000 && g.season < 2010 },
] as const;

type EraId = (typeof ERAS)[number]["id"];

export default function Boards({
  heartbreak,
  miracle,
}: {
  heartbreak: Game[];
  miracle: Game[];
}) {
  const [board, setBoard] = useState<Board>("heartbreak");
  const [era, setEra] = useState<EraId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const source = board === "heartbreak" ? heartbreak : miracle;
    const test = ERAS.find((e) => e.id === era)!.test;
    return source.filter(test);
  }, [board, era, heartbreak, miracle]);

  const selected = list.find((g) => g.id === selectedId) ?? list[0];

  return (
    <section className={styles.wrap}>
      <div className={styles.controls}>
        <div className={styles.toggle} role="tablist" aria-label="Board">
          {(["heartbreak", "miracle"] as const).map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={board === b}
              className={`${styles.tab} ${board === b ? styles.tabOn : ""}`}
              onClick={() => {
                setBoard(b);
                setSelectedId(null);
              }}
            >
              {b === "heartbreak" ? "Heartbreak" : "Miracles"}
            </button>
          ))}
        </div>

        <div className={styles.eras}>
          {ERAS.map((e) => (
            <button
              key={e.id}
              className={`${styles.era} ${era === e.id ? styles.eraOn : ""}`}
              onClick={() => {
                setEra(e.id);
                setSelectedId(null);
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.explainer}>
        {board === "heartbreak"
          ? "The highest win probability the Jets reached in the second half of a game they went on to lose."
          : "The lowest win probability the Jets fell to in the second half of a game they went on to win."}
      </p>

      <div className={styles.split}>
        <div className={styles.detail}>
          {selected ? <SwingCurve game={selected} board={board} /> : null}
        </div>

        <ol className={styles.list}>
          {list.map((g, i) => {
            const on = g.id === selected?.id;
            return (
              <li key={g.id}>
                <button
                  className={`${styles.row} ${on ? styles.rowOn : ""}`}
                  onClick={() => setSelectedId(g.id)}
                  aria-current={on}
                >
                  <span className={`${styles.rank} mono`}>{i + 1}</span>
                  <span className={styles.meta}>
                    <span className={styles.matchup}>
                      {g.atHome ? "vs" : "at"} {g.opponentDisplay}
                      <span className={styles.date}>
                        {g.date}
                        {g.wentToOt ? " · OT" : ""}
                        {g.seasonType !== "REG" ? " · playoffs" : ""}
                      </span>
                    </span>
                    <span className={styles.play}>
                      {g.keyPlay.desc ? (
                        <>
                          <span className={`${styles.clock} mono`}>
                            {clockLabel(g.keyPlay.qtr, g.keyPlay.secondsLeft)}
                          </span>
                          {g.keyPlay.desc}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </span>
                  <span className={styles.numbers}>
                    <span className={`${styles.swing} mono`}>
                      {((g.swing ?? 0) * 100).toFixed(1)}%
                    </span>
                    <span className={`${styles.score} mono`}>
                      {g.jetsScore}–{g.oppScore}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
