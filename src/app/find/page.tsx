import Link from "next/link";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";
import { formatDate } from "@/lib/current";
import { loadGameDiscovery } from "@/lib/load-game-discovery";
import { pageMetadata } from "@/lib/site";
import { teamName } from "@/lib/teams";
import { snapPath } from "@/lib/snap-explorer";
import { loadSnapGame } from "@/lib/load-snaps";
import { focusFonts } from "../focus-fonts";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  path: "/find",
  title: "Find a Jets game — ajetsfan",
  description: "Search published Jets game reports by opponent, season or a play you remember. Open the report, visual story and Film Room studies when available.",
});

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 120;
const resultVerb = { win: "Won", loss: "Lost", tie: "Tied" };
const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function FindPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = firstParam(params.q).slice(0, MAX_QUERY_LENGTH).trim();
  const results = query ? await loadGameDiscovery(query) : [];
  const total = results.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageParam = firstParam(params.page);
  const page = /^[1-9]\d*$/.test(pageParam) ? Math.min(pages, Number(pageParam)) : 1;
  const start = (page - 1) * PAGE_SIZE;
  const visible = results.slice(start, start + PAGE_SIZE);
  const archives = await Promise.all(visible.map(({ game }) => loadSnapGame(game.id)));
  const playable = new Set(archives.flatMap(game => game ? [game.id] : []));
  const resultRange = total > PAGE_SIZE ? `Showing ${start + 1}–${start + visible.length} of ${total} games.` : `${total} ${total === 1 ? "game" : "games"} found.`;
  const linkToPage = (number: number) => `/find?${new URLSearchParams({ q: query, ...(number > 1 ? { page: String(number) } : {}) })}#search-results`;

  return <FocusShell page="find" name="Find a game" entries={[
    { id: "game-search", title: "Find a game", answer: "Search games" },
    ...(query ? [{ id: "search-results", title: "Results", answer: `${total} ${total === 1 ? "game" : "games"}` }] : []),
  ]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="game-search" first heading="Find a game.">
      <p className={shared.caption}>Search published Jets games by opponent, season or a play you remember.</p>
      <form action="/find" method="get" role="search" aria-label="Game search" className={styles.search}>
        <label htmlFor="game-search-query">Search games</label>
        <div className={styles.controls}>
          <input id="game-search-query" type="search" name="q" defaultValue={query} maxLength={MAX_QUERY_LENGTH} placeholder="Try 2022 Browns" />
          <button className={shared.button} type="submit">Search</button>
        </div>
      </form>
      <div className={styles.links}>
        <Link prefetch={false} className={shared.go} href="/replay">Browse game replays</Link>
        <Link prefetch={false} className={shared.go} href="/replay/studies/player">Find a player by situation</Link>
        <Link prefetch={false} className={shared.go} href="/plays">Find two-minute comebacks</Link>
      </div>
    </FocusMoment>

    {query ? <FocusMoment id="search-results" heading={total ? "Matching games" : "No games match."}>
      {total ? <>
        <p className={shared.caption}>{resultRange}</p>
        <ol className={styles.results} start={start + 1} role="list" aria-label="Matching games">
          {visible.map(({ game, material }) => {
            const heading = `Jets ${game.atHome ? "vs" : "at"} ${teamName(game.opponentDisplay)}`;
            const date = formatDate(game.date);
            return <li key={game.id}>
              <h3>{heading}</h3>
              <p className={styles.resultLine}><time dateTime={game.date}>{date}</time><span aria-hidden="true">·</span><strong>{resultVerb[game.outcome]} {game.jetsScore}–{game.oppScore}</strong></p>
              <div className={styles.links}>
                <Link href={`/games/${game.id}`} prefetch={false} className={shared.go}>Game report<span className="sr-only"> for {heading} on {date}</span></Link>
                {playable.has(game.id) && <>
                  <Link prefetch={false} className={shared.go} href={"/replay/" + game.id}>Replay this game<span className="sr-only"> for {heading} on {date}</span></Link>
                  <Link prefetch={false} className={shared.go} href={snapPath(game.id, "start")}>Follow play by play<span className="sr-only"> for {heading} on {date}</span></Link>
                </>}
                {material.map(({ href, label }) => <Link key={href} href={href} prefetch={false} className={shared.go}>{label}<span className="sr-only"> for {heading} on {date}</span></Link>)}
              </div>
            </li>;
          })}
        </ol>
        {pages > 1 ? <nav aria-label="Search results pages" className={styles.links}>
          {page > 1 ? <Link className={shared.go} prefetch={false} href={linkToPage(page - 1)}><span aria-hidden="true">←</span> Previous page</Link> : null}
          {page < pages ? <Link className={shared.go} prefetch={false} href={linkToPage(page + 1)}>Next page <span aria-hidden="true">→</span></Link> : null}
        </nav> : null}
      </> : <p className={shared.caption}>Try a different opponent or season, or search with fewer words.</p>}
    </FocusMoment> : null}
  </FocusShell>;
}
