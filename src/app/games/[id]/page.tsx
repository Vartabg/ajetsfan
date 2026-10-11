import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCurve, loadAnalytics } from "@/lib/load-games";
import { loadPublishedGame, loadPublishedGames } from "@/lib/load-published-pages";
import { formatDate } from "@/lib/current";
import { clockLabel, pct } from "@/lib/games";
import { gameHref } from "@/lib/explorer";
import { fanMemoryForGame } from "@/lib/fan-memories";
import { keyPlayEvidenceLabel } from "@/lib/morgue";
import { wpaLabel } from "@/lib/analytics-context";
import { gameEvidence } from "@/lib/game-evidence";
import { pageMetadata } from "@/lib/site";
import { teamColor, teamName, venueLine } from "@/lib/teams";
import { placeName } from "@/lib/focus";
import { mediaCollection } from "@/lib/media-catalog";
import { formatMediaDate, mediaForGame } from "@/lib/media";
import { gameEditorialPhoto } from "@/lib/editorial-photos";
import EditorialPhoto from "@/components/EditorialPhoto";
import InlineMedia from "@/components/InlineMedia";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";
import { buildVisualStory } from "@/lib/visual-story";
import { buildFilmCases } from "@/lib/film-room";
import GameEvidence from "@/components/GameEvidence";
import PressChart from "@/components/PressChart";
import SeasonReturn from "@/components/SeasonReturn";
import { focusFonts } from "../../focus-fonts";
import styles from "./page.module.css";

type Props = { params: Promise<{ id: string }> };
async function getCase(id: string) {
  const game = await loadPublishedGame(id);
  if (!game) notFound();
  return game;
}

export const dynamicParams = false;
export async function generateStaticParams() {
  return (await loadPublishedGames()).map((game) => ({ id: game.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await getCase((await params).id);
  const title = `Jets ${game.jetsScore}–${game.oppScore} ${game.opponentDisplay} · ${formatDate(game.date)}`;
  const description = `The Jets ${game.outcome === "win" ? "beat" : "lost to"} ${game.opponentDisplay} ${game.jetsScore}–${game.oppScore}${game.wentToOt ? " in overtime" : ""}. ${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"}, Week ${game.week}. Final score, model win-probability curve and recorded play evidence.`;
  return pageMetadata({ title, description, path: `/games/${game.id}` });
}

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;
const KIND = { video: "Video", audio: "Audio", post: "Post", article: "Article" } as const;

export default async function GamePage({ params }: Props) {
  const game = await getCase((await params).id);
  const memory = fanMemoryForGame(game);
  const board = game.outcome === "win" ? "miracle" : "heartbreak";
  const [rawPoints, analytics] = await Promise.all([loadCurve(game.id), loadAnalytics()]);
  const statistics = analytics?.season === game.season ? analytics.games.find((item) => item.id === game.id) ?? null : null;
  const points = rawPoints.filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1);
  const hasVisualStory = buildVisualStory(game, points) != null;
  const filmCase = buildFilmCases([game], { [game.id]: rawPoints })[0];
  const hasEvidence = gameEvidence(game, statistics) != null;
  const venue = venueLine(game);
  const rival = { "--rival": teamColor(game.opponentDisplay) } as CSSProperties;
  const replays = mediaForGame(mediaCollection.items, game.id);
  const photo = gameEditorialPhoto(game.id);
  const outletName = (id: string) => mediaCollection.outlets.find((outlet) => outlet.id === id)?.name ?? id;
  const verb = game.outcome === "win" ? "Won" : "Lost";
  const opponent = teamName(game.opponentDisplay) === game.opponentDisplay ? game.opponentDisplay : `the ${teamName(game.opponentDisplay)}`;
  const when = `${game.season} · ${game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`}`;
  const clock = clockLabel(game.keyPlay.qtr, game.keyPlay.secondsLeft) || "Clock unavailable";
  const extreme = board === "heartbreak" ? "the Jets’ best chance to win after halftime." : "the Jets’ lowest chance to win after halftime.";

  const sources = <details className={styles.about}>
    <summary>About this analysis</summary>
    <p>Final score and play-by-play: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">nflverse{NEW_TAB}</a>. Probability is a model estimate. The curve contains usable source points; gaps are not reconstructed. Archive rankings exclude flagged scores and ties.</p>
    <p>The featured play uses Jets-oriented model probability change after halftime, including overtime. The change does not explain why the game was won or lost.</p>
    {venue ? <p>Venue, roof and kickoff weather come from the nflverse schedule record for this game; they describe recorded conditions, not an effect on the result.</p> : null}
    <Link href="/how-made#efficiency">Sources and analysis methods <span aria-hidden="true">↗</span></Link>
  </details>;

  const entries: FocusEntry[] = [
    { id: "final", title: "Final", answer: `${verb} ${game.jetsScore}–${game.oppScore}` },
    { id: "game-report", title: memory ? "The account" : "Summary", answer: replays.length ? `${replays.length} to watch` : memory ? "Sourced" : "On record" },
    { id: "turn", title: "Win chance", answer: pct(game.swing) },
    { id: "play", title: "Featured play", answer: wpaLabel(game.keyPlay.wpa) },
    ...(hasEvidence ? [{ id: "numbers", title: "Both offenses", answer: "Measured" }] : []),
  ];

  return <FocusShell page="game" name={when} entries={entries} checkedAt={null} section="/seasons" className={focusFonts}>
    <FocusMoment id="final" first
      label={`${when} · ${formatDate(game.date)}`}
      heading={<>{verb} {game.jetsScore}–{game.oppScore} <em>{game.atHome ? "vs" : "at"} {placeName(game.opponentDisplay)}{game.wentToOt ? " in overtime" : ""}.</em></>}
      actions={<><SeasonReturn year={game.season} fallback={`/seasons/${game.season}`} fallbackLabel={`The ${game.season} season`} className={shared.go} /><Link href="/morgue#archive-filters" className={shared.go}>Find another game</Link></>}>
      <div className={shared.shape}>
        <div className={styles.score} style={rival} role="group" aria-label={`Final score: Jets ${game.jetsScore}, ${game.opponentDisplay} ${game.oppScore}`}>
          <span data-team="jets">NYJ <strong>{game.jetsScore}</strong></span>
          <span data-team="opponent">{game.opponentDisplay} <strong>{game.oppScore}</strong></span>
        </div>
        {photo ? <EditorialPhoto photo={photo} eager className={styles.photo} sizes="(max-width: 1023px) calc(100vw - 32px), min(880px, calc(90vw - 272px))" /> : null}
        <p className={shared.caption}>{photo ? null : <><time dateTime={game.date}>{formatDate(game.date)}</time> · </>}{teamName(game.opponentDisplay)} · {game.atHome ? "Home game" : "Away game"}{venue ? ` · ${venue}` : ""}</p>
      </div>
    </FocusMoment>

    <FocusMoment id="game-report" label={memory ? "Sourced game account" : "The game on record"} heading={memory?.title ?? "Game summary."}
      actions={<>
        {memory ? <a className={shared.go} href={memory.source.url} target="_blank" rel="noreferrer">{memory.source.label} <span aria-hidden="true">↗</span>{NEW_TAB}</a> : null}
        {hasVisualStory ? <Link className={shared.go} href={`/stories?story=${encodeURIComponent(game.id)}#visual-story`}>Explore the visual game story <span aria-hidden="true">→</span></Link> : null}
      </>}>
      <p className={styles.account}>{memory?.fact ?? `The Jets ${game.outcome === "win" ? "won" : "lost"} ${game.jetsScore}–${game.oppScore} ${game.atHome ? "at home against" : "on the road against"} ${opponent}${game.wentToOt ? " in overtime" : ""}. This is a game from the ${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"} archive.`}</p>
      {replays.length ? <section className={styles.replays} aria-labelledby="game-replays-heading">
        <h3 id="game-replays-heading">Watch it back.</h3>
        <ul>{replays.map((item) => <li key={item.id}><InlineMedia item={item} outletName={outletName(item.outletId)}><span><strong>{item.title}</strong><small>{outletName(item.outletId)} · {formatMediaDate(item.publishedAt)} · {KIND[item.kind]}</small></span></InlineMedia></li>)}</ul>
      </section> : null}
    </FocusMoment>

    <FocusMoment id="turn" label="Win chance · play by play" heading={<>{pct(game.swing)} <em>was {extreme}</em></>}
      actions={<><Link className={shared.go} href={`${gameHref(game.id, board)}#game-case-heading`}>Open the interactive game tape <span aria-hidden="true">→</span></Link></>}>
      {points.length >= 2 ? <figure className={`${shared.shape} ${styles.chart}`}>
        <PressChart points={points} board={board} />
        <figcaption>Model-estimated Jets win probability before each recorded play · play sequence · {points.length} usable points</figcaption>
      </figure> : <p className={shared.caption}>A usable probability curve is unavailable in this edition.</p>}
    </FocusMoment>

    <FocusMoment id="play" label={`From the play-by-play · ${clock}`} heading={<>{keyPlayEvidenceLabel(game)}. <em>{wpaLabel(game.keyPlay.wpa)}</em></>}
      actions={filmCase ? <Link className={shared.go} href={`/film-room?play=${filmCase.id}`}>Study this game in the Film Room <span aria-hidden="true">→</span></Link> : null}>
      {game.keyPlay.desc ? <p className={styles.account}>{game.keyPlay.desc}</p> : <p className={shared.caption}>No featured play description is available in this edition.</p>}
      <p className={shared.caption}>Jets model win-probability change on this play: <strong>{wpaLabel(game.keyPlay.wpa)}</strong>.</p>
      {hasEvidence ? null : sources}
    </FocusMoment>

    {hasEvidence ? <FocusMoment id="numbers" hosts>
      <GameEvidence game={game} statistics={statistics} />
      {sources}
    </FocusMoment> : null}
  </FocusShell>;
}
