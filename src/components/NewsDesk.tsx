import Link from "next/link";
import type { ReactNode } from "react";
import type { CoverageSnapshot, NewsItem } from "@/lib/coverage";
import { formatCheckedAt } from "@/lib/current";
import { newsCategory } from "@/lib/news-category";
import FeedStatus from "./FeedStatus";
import styles from "./NewsDesk.module.css";

/** The wire supplies a headline and dateline. Keep those details beside the selected story. */
export function NewsBrief({ item, children, className, summaryClassName }: {
  item: NewsItem; children: ReactNode; className?: string; summaryClassName?: string;
}) {
  return <details className={`${styles.brief} ${className ?? ""}`} data-inline-news={item.id}>
    <summary className={summaryClassName}>{children}</summary>
    <div className={styles.briefBody} data-news-details={item.id}>
      <p className={styles.briefLabel}>Official Jets coverage</p>
      <p>Published <time dateTime={item.publishedAt}>{formatCheckedAt(item.publishedAt)}</time> by the New York Jets.</p>
      <p>The team wire supplies this headline and publication date. The full article is available from its publisher.</p>
      <details className={styles.source}>
        <summary>Article source</summary>
        <a href={item.url} target="_blank" rel="noopener noreferrer">Read the full article on newyorkjets.com <span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens in a new tab)</span></a>
      </details>
    </div>
  </details>;
}

export default function NewsDesk({ feed, limit = 8, compact = false, externalHeadingId }: {
  feed: CoverageSnapshot["news"];
  limit?: number;
  compact?: boolean;
  externalHeadingId?: string;
}) {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 8;
  const items = [...feed.items]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id))
    .slice(0, count);
  const [lead, ...headlines] = items;
  const headingId = externalHeadingId ?? (compact ? "around-jets-heading" : "news-desk-heading");

  return (
    <section id={compact ? "around-jets" : "news"} className={`${styles.desk} ${compact ? styles.compact : ""}`} aria-labelledby={headingId}>
      {!externalHeadingId ? <div className={styles.header}>
        <div>
          <p className={styles.kicker}><span className={styles.wireLabel}>The team wire</span>{" "}<span>Official Jets coverage</span></p>
          <h2 id={headingId} className="hed">Meanwhile, in<br className={styles.headingBreak} /> Florham Park.</h2>
        </div>
        {compact ? <Link className={styles.allNews} href="/team/news">All team news <span aria-hidden="true">→</span></Link> : null}
      </div> : null}

      {lead ? (
        <div className={`${styles.stories} ${headlines.length ? "" : styles.single}`}>
          <NewsBrief item={lead} summaryClassName={styles.lead}>
            <span className={styles.leadKicker}><span className={styles.leadIndex} aria-hidden="true">01 / </span>From the team wire</span>
            <div className={styles.storyMeta}><span className={styles.category}>{newsCategory(lead.title)}</span><time className={styles.published} dateTime={lead.publishedAt}>Published {formatCheckedAt(lead.publishedAt)}</time></div>
            <h3>{lead.title}</h3>
            <span className={styles.read}>Story details <span aria-hidden="true">+</span></span>
          </NewsBrief>
          {headlines.length ? (
            <ul className={styles.headlines} aria-label="More official Jets headlines">
              {headlines.map((item, index) => (
                <li key={item.id}>
                  <NewsBrief item={item} summaryClassName={styles.headline}>
                    <span className={styles.headlineIndex} aria-hidden="true">{String(index + 2).padStart(2, "0")}</span>
                    <div className={styles.storyMeta}><span className={styles.category}>{newsCategory(item.title)}</span><time className={styles.published} dateTime={item.publishedAt}>Published {formatCheckedAt(item.publishedAt)}</time></div>
                    <h3>{item.title}</h3>
                    <span className={styles.headlineArrow} aria-hidden="true">+</span>
                    <span className={styles.srOnly}>Show story details</span>
                  </NewsBrief>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>The next headline starts here.</p>
          <p>{feed.status === "unavailable" ? "Official team news will appear after a successful source check." : "No articles are available in this edition."}</p>
          <a href="https://www.newyorkjets.com/news/" target="_blank" rel="noopener noreferrer">Visit official Jets news <span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens in a new tab)</span></a>
        </div>
      )}

      <div className={styles.footer}><FeedStatus feed={feed} label="Official Jets news" />{feed.withheldFutureItems ? <p>{feed.withheldFutureItems} future-dated {feed.withheldFutureItems === 1 ? "entry is" : "entries are"} withheld until publication.</p> : null}</div>
    </section>
  );
}
