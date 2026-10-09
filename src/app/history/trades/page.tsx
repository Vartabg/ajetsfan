import Link from "@/components/IntentLink";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import shared from "@/components/Focus.module.css";
import { focusFonts } from "../../focus-fonts";
import { formatCheckedAt, formatDate } from "@/lib/current";
import { playerLine, pickLabel, tradesBySeason, type TradeAsset } from "@/lib/draft-trades";
import { loadTradeLedger } from "@/lib/load-trades";
import { pageMetadata } from "@/lib/site";
import { teamColor, teamName } from "@/lib/teams";
import type { CSSProperties } from "react";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/history/trades", title: "Jets Trade Ledger — every pick, followed", description: "Every recorded Jets trade since 2002, with each draft pick followed to the player it became or to the trade that moved it again. Built from nflverse trade and draft records." });

function Asset({ asset }: { asset: TradeAsset }) {
  if (asset.kind === "player") return <li className={styles.asset}><strong>{asset.name}</strong><span className={styles.assetKind}>Player</span></li>;
  const became = asset.became;
  return <li className={styles.asset}>
    <strong>{pickLabel(asset)}</strong>
    {became.type === "selected" ? <span className={styles.outcome}><span aria-hidden="true">→ </span>{playerLine(became.player)} · selected by {teamName(became.team)}{became.agreed ? "" : " after moving again outside the trade record"}</span> : null}
    {became.type === "named" ? <span className={styles.outcome}><span aria-hidden="true">→ </span>{became.player} · named in the trade record</span> : null}
    {became.type === "unnumbered" ? <span className={styles.outcome}>Pick number not recorded</span> : null}
    {became.type === "pending" ? <span className={styles.outcome}>Draft not yet held</span> : null}
    {became.type === "traded" ? <>
      <span className={styles.outcome}><span aria-hidden="true">→ </span>Traded to {teamName(became.to)} on {formatDate(became.date)}{became.packagedWith ? ` with ${became.packagedWith} other ${became.packagedWith === 1 ? "asset" : "assets"}` : ""}{became.repeated ? ", in the deal listed above" : became.received.length ? ", in a deal that returned" : ""}</span>
      {became.received.length ? <ul className={styles.chain}>{became.received.map((item, index) => <Asset key={index} asset={item} />)}</ul> : null}
    </> : null}
  </li>;
}

export default async function TradesPage() {
  const ledger = await loadTradeLedger();
  const seasons = ledger ? tradesBySeason(ledger.trades) : [];
  return <FocusShell page="trades" entries={[
    { id: "ledger", title: "The trade ledger", answer: "Every pick, followed" },
    ...(ledger ? [{ id: "trades-ledger", title: "Recorded deals", answer: `${ledger.counts.trades} trades` }, { id: "trade-sources", title: "Sources", answer: "Trace every connection" }] : []),
  ]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="ledger" first label="Jets history · trade record" heading="The trade ledger."
      actions={<Link href="/history" className={shared.go}>Jets history <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>Every pick, followed to what it became. See the player selected with it, or the later deal that moved it again.</p>
      {ledger ? <>
      <p className={styles.standfirst}><strong>{ledger.counts.trades} recorded trades, {ledger.firstSeason}–{ledger.lastSeason}.</strong> {ledger.counts.picksGiven} picks sent and {ledger.counts.picksReceived} received, counting picks that moved again. Checked <time dateTime={ledger.checkedAt}>{formatCheckedAt(ledger.checkedAt)}</time>.</p>
      <nav className={styles.seasonNav} aria-label="Trade seasons">{seasons.map(({ season, trades }) => <a key={season} href={`#trades-${season}`}>{season}<small>{trades.length}</small></a>)}</nav>
      </> : <p className={styles.standfirst}>The trade ledger is unavailable in this edition.</p>}
    </FocusMoment>
    {ledger ? <>
      <FocusMoment id="trades-ledger" hosts>
      {seasons.map(({ season, trades }) => <section key={season} id={`trades-${season}`} className={styles.season} aria-labelledby={`trades-${season}-heading`}>
        <h2 id={`trades-${season}-heading`} className="hed">{season}</h2>
        {trades.map((trade) => <article key={trade.id} className={styles.trade} data-trade={trade.id} style={{ "--rival": teamColor(trade.partners[0]), "--rival-2": teamColor(trade.partners[0], 1) } as CSSProperties}>
          <header className={styles.tradeHead}><time dateTime={trade.date}>{formatDate(trade.date)}</time><h3>With {trade.partners.map((code) => teamName(code)).join(" and ")}</h3></header>
          <div className={styles.sides}>
            <div><h4>Jets gave</h4>{trade.gave.length ? <ul>{trade.gave.map((asset, index) => <Asset key={index} asset={asset} />)}</ul> : <p>Nothing recorded</p>}</div>
            <div><h4>Jets received</h4>{trade.received.length ? <ul>{trade.received.map((asset, index) => <Asset key={index} asset={asset} />)}</ul> : <p>Nothing recorded</p>}</div>
          </div>
        </article>)}
      </section>)}
      </FocusMoment>
      <FocusMoment id="trade-sources" label="The trade ledger" heading="Every connection, sourced.">
      <footer className={styles.sources}>
        <p>Trades and the players named with picks come from the <a href={ledger.sources.trades} target="_blank" rel="noreferrer">nflverse trade record</a>; selections come from the <a href={ledger.sources.draft} target="_blank" rel="noreferrer">nflverse draft record</a>. The trade record begins in 2002. A pick is followed to the selection made with it, or to the later trade that moved it; the assets that came back in that later deal are listed as the deal returned them, not as the value of one pick. When the draft record shows a different club selecting, the pick changed hands by a route the trade record does not contain, and the line says so. Conditional picks and picks without a recorded number appear as recorded. No valuation is applied.</p>
        <p><Link href="/history">Jets history <span aria-hidden="true">→</span></Link> <Link href="/how-made">Sources &amp; how it works <span aria-hidden="true">→</span></Link></p>
      </footer>
      </FocusMoment>
    </> : null}
  </FocusShell>;
}
