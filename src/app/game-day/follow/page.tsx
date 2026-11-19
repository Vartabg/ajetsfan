import Link from "next/link";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import shared from "@/components/Focus.module.css";
import styles from "@/components/SnapReader.module.css";
import { BUFFALO, CLEVELAND, snapPath } from "@/lib/snap-explorer";
import { loadFootballState } from "@/lib/load-football";
import { formatDate, nextScheduledGame } from "@/lib/current";
import { pageMetadata } from "@/lib/site";
import { teamName } from "@/lib/teams";

export const metadata = pageMetadata({ path: "/game-day/follow", title: "Follow at my TV clock · ajetsfan", description: "Choose a Jets game and follow one recorded play at a time at your own pace." });

function GameChoice({ id, label }: { id: string; label: string }) {
  return <div className={styles.choices}>
    <Link prefetch={false} href={snapPath(id, "start")}>{label}</Link>
    <Link prefetch={false} href={snapPath(id, "clock")} aria-label={"Choose a TV clock for " + label}>Choose a clock</Link>
  </div>;
}

export default async function FollowPage() {
  const { edition } = await loadFootballState();
  const current = edition.current;
  const featured = edition.live?.status !== "unavailable" ? edition.live?.featured : null;
  const selectedId = featured?.state === "live" ? featured.gameId : nextScheduledGame(current)?.game.id;
  const fixture = current.schedule.find(game => game.id === selectedId);
  return <FocusShell page="follow" section="/game-day" name="Follow at my clock" checkedAt={null}
    entries={[{ id: "follow", title: "At my clock", answer: "Choose a game" }]}>
    <FocusMoment id="follow" first label="Game Day" heading="Follow at your TV clock.">
      <p className={shared.caption}>Choose a game to start at its first play, or enter the clock on your screen. The score and drive advance when you do.</p>
      {fixture && <GameChoice id={fixture.id} label={"Jets " + (fixture.atHome ? "vs. " : "at ") + teamName(fixture.opponentDisplay) + " · " + formatDate(fixture.date)} />}
      <h2>Replay a game</h2>
      <GameChoice id={BUFFALO} label="Buffalo · 2026" />
      <GameChoice id={CLEVELAND} label="Cleveland · 2022" />
    </FocusMoment>
  </FocusShell>;
}
