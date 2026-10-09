import { Suspense } from "react";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import DeepCutComparison, { DeepCutPaths } from "@/components/DeepCutComparison";
import Link from "@/components/IntentLink";
import { buildDiscoveries } from "@/lib/discoveries";
import { pct, type Game } from "@/lib/games";
import { loadCurrent, loadGames, loadCurve } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { formatDate } from "@/lib/current";
import { placeName } from "@/lib/focus";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../focus-fonts";
import shared from "@/components/Focus.module.css";
import styles from "@/components/DeepCuts.module.css";

export const metadata = pageMetadata({ path: "/discover", title: "Deep cuts · Jets discoveries from the record", description: "Same final score, different games. Wins from below 1%, losses after 95%, and the biggest recorded second-half play changes, with every case a tap away." });

const gameLabel = (game: Game) => `${game.season} ${game.atHome ? "vs" : "at"} ${placeName(game.opponentDisplay)}`;
const gameHref = (game: Game) => `/games/${encodeURIComponent(game.id)}`;
const signed = (wpa: number) => `${wpa > 0 ? "+" : ""}${(wpa * 100).toFixed(1)}`;

function Cases({ games, kind }: { games: Game[]; kind: "wins" | "losses" | "plays" }) {
  return <ul className={styles.cases}>{games.map((game) => <li key={game.id}>
    <Link className={styles.case} href={gameHref(game)}>
      <b>{gameLabel(game)}</b><small>{formatDate(game.date)} · Jets {game.jetsScore}–{game.oppScore}</small>
      <span>{kind === "wins" ? pct(game.troughH2Wp, 2) : kind === "losses" ? pct(game.peakH2Wp, 2) : `${signed(game.keyPlay.wpa!)} pp`}</span>
    </Link>
  </li>)}</ul>;
}

export default async function DiscoverPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const discoveries = buildDiscoveries(publishedGames(games, snapshot));
  const { scope, sameScore, belowOnePercent, aboveNinetyFivePercent, biggestKeyPlays } = discoveries;
  const paths = sameScore ? await Promise.all([sameScore.low, sameScore.high].map(async (game) => ({
    id: game.id, label: gameLabel(game), points: (await loadCurve(game.id)).filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1),
  }))) : [];
  const strongest = biggestKeyPlays[0];
  const range = scope.firstSeason === null ? "No eligible cases in this edition." : `${scope.firstSeason}–${scope.lastSeason} football seasons, through ${formatDate(scope.lastDate!)}. Regular season and playoffs; overtime included.`;
  return <FocusShell page="discover" checkedAt={snapshot?.checkedAt ?? null} className={focusFonts} entries={[
    { id: "same-score", title: "Same score", answer: sameScore ? `Two ${sameScore.jetsScore}–${sameScore.oppScore} wins` : "What a score can hide" },
    { id: "one-percent", title: "Below 1%", answer: `${belowOnePercent.length} improbable wins` },
    { id: "ninety-five", title: "Above 95%", answer: `${aboveNinetyFivePercent.length} losses from a high` },
    { id: "one-play", title: "One play", answer: strongest ? `${signed(strongest.keyPlay.wpa!)} probability points` : "Recorded model changes" },
    { id: "evidence", title: "The evidence", answer: `${scope.games} published cases` },
  ]}>
    <FocusMoment id="same-score" first label="Deep cuts · What the final score hides" heading={sameScore ? <>Two {sameScore.jetsScore}–{sameScore.oppScore} wins. <em>Two different stories.</em></> : <>What can <em>a score hide?</em></>}>
      {sameScore ? <>
        <figure className={shared.shape}>
          <div className={styles.pair}>{[sameScore.low, sameScore.high].map((game) => <div key={game.id} className={styles.pairRow}>
            <Link href={gameHref(game)}>{gameLabel(game)} →</Link><time dateTime={game.date}>{formatDate(game.date)}</time>
            <strong className={styles.number}>{pct(game.troughH2Wp)}</strong>
            <div className={styles.track} aria-hidden="true"><span style={{ width: `${game.troughH2Wp! * 100}%` }} /></div>
          </div>)}</div>
          <figcaption>Each bar is that win’s lowest second-half Jets win chance. The same final score hides a {(sameScore.gap * 100).toFixed(1)} percentage-point gap.</figcaption>
          <p className={styles.note}>Largest gap among {sameScore.pairCount} exact-score pairs in {scope.wins} eligible wins. {range}</p>
        </figure>
        <Suspense fallback={<details className={shared.unfold}><summary>Compare their play-by-play paths</summary><p className={styles.note}>Both paths use the same win-chance scale. Open either game above to inspect its plays.</p><DeepCutPaths games={paths} /></details>}>
          <DeepCutComparison games={paths} />
        </Suspense>
      </> : <p className={shared.caption}>No two eligible wins share a final score in this edition.</p>}
    </FocusMoment>
    <FocusMoment id="one-percent" label="The improbable wins" heading={<>{belowOnePercent.length} {belowOnePercent.length === 1 ? "win" : "wins"} from below 1%. <em>Find the way back.</em></>}>
      <div className={shared.shape}>
        <Cases games={belowOnePercent} kind="wins" />
        <p className={shared.caption}>These Jets wins reached a pre-play model estimate strictly below 1% during the second half. The displayed percentage is each game’s low.</p>
        <p className={styles.note}>{belowOnePercent.length} of {scope.wins} eligible wins. {range}</p>
      </div>
      <Link className={shared.go} href="/morgue?board=miracle">Explore every comeback →</Link>
    </FocusMoment>
    <FocusMoment id="ninety-five" label="The lead that got away" heading={<>{aboveNinetyFivePercent.length} {aboveNinetyFivePercent.length === 1 ? "loss" : "losses"} after 95%. <em>See where they turned.</em></>}>
      <div className={shared.shape}>
        <Cases games={aboveNinetyFivePercent.slice(0, 6)} kind="losses" />
        <p className={shared.caption}>These losses reached a pre-play Jets win chance strictly above 95% in the second half. Each percentage is the game’s high.</p>
        {aboveNinetyFivePercent.length > 6 ? <details className={shared.unfold}><summary>See all {aboveNinetyFivePercent.length} cases</summary><Cases games={aboveNinetyFivePercent.slice(6)} kind="losses" /></details> : null}
        <p className={styles.note}>{aboveNinetyFivePercent.length} of {scope.losses} eligible losses. {range}</p>
      </div>
      <Link className={shared.go} href="/morgue?board=heartbreak">Explore every lost lead →</Link>
    </FocusMoment>
    <FocusMoment id="one-play" label="One play · Model win-chance change" heading={strongest ? <>One play shifted it <em>{Math.abs(strongest.keyPlay.wpa! * 100).toFixed(1)} points.</em></> : <>A play can <em>change the game.</em></>}>
      {strongest ? <>
        <div className={shared.shape}>
          <p className={styles.swing}>{signed(strongest.keyPlay.wpa!)}</p>
          <p className={shared.caption}>Percentage points of Jets win chance on the saved key play in {gameLabel(strongest)}. Final: Jets {strongest.jetsScore}–{strongest.oppScore}.</p>
          <blockquote className={styles.excerpt}>{strongest.keyPlay.desc}</blockquote>
          <p className={styles.note}>Largest absolute change among {biggestKeyPlays.length} usable saved second-half key plays, one per published case. {range}</p>
        </div>
        <details className={shared.unfold}><summary>Compare the ten largest saved changes</summary><Cases games={biggestKeyPlays.slice(0, 10)} kind="plays" /></details>
        <Link className={shared.go} href={gameHref(strongest)}>Open the play’s game →</Link>
      </> : <p className={shared.caption}>No usable recorded key plays in this edition.</p>}
    </FocusMoment>
    <FocusMoment id="evidence" label="Follow the finding" heading={<>Surprising facts. <em>Open evidence.</em></>}>
      <div className={shared.shape}>
        <p className={shared.caption}>These discoveries are calculated from {scope.games} published Jets game cases with reconciled final scores and usable second-half probability estimates. {range}</p>
        <p className={shared.caption}>Win chance and play changes are nflfastR model estimates. The final scores are recorded results. Missing estimates, flagged games, duplicate identities and unconfirmed current results stay out of the sample.</p>
        <p className={shared.caption}>A game link opens its final, probability path and recorded play evidence. Earlier Jets history has separate sourced accounts.</p>
      </div>
      <div className={shared.actions}><Link className={shared.go} href="/how-made#discovery-methods">Inspect the calculations →</Link><Link className={shared.go} href="/history/trades">Follow a traded pick →</Link><Link className={shared.go} href="/stories">Replay a comeback →</Link></div>
    </FocusMoment>
  </FocusShell>;
}
