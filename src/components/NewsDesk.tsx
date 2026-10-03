import Link from "next/link";
import type { CoverageSnapshot } from "@/lib/coverage";
import { formatCheckedAt } from "@/lib/current";
import { newsCategory } from "@/lib/news-category";
import FeedStatus from "./FeedStatus";
import styles from "./NewsDesk.module.css";

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
          <a className={styles.lead} href={lead.url} target="_blank" rel="noopener noreferrer">
            <span className={styles.leadKicker}><span className={styles.leadIndex} aria-hidden="true">01 / </span>From the team wire</span>
            <div className={styles.storyMeta}><span className={styles.category}>{newsCategory(lead.title)}</span><time className={styles.published} dateTime={lead.publishedAt}>Published {formatCheckedAt(lead.publishedAt)}</time></div>
            <h3>{lead.title}</h3>
            <span className={styles.read}>Read on newyorkjets.com <span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens in a new tab)</span></span>
          </a>
          {headlines.length ? (
            <ul className={styles.headlines} aria-label="More official Jets headlines">
              {headlines.map((item, index) => (
                <li key={item.id}>
                  <a className={styles.headline} href={item.url} target="_blank" rel="noopener noreferrer">
                    <span className={styles.headlineIndex} aria-hidden="true">{String(index + 2).padStart(2, "0")}</span>
                    <div className={styles.storyMeta}><span className={styles.category}>{newsCategory(item.title)}</span><time className={styles.published} dateTime={item.publishedAt}>Published {formatCheckedAt(item.publishedAt)}</time></div>
                    <h3>{item.title}</h3>
                    <span className={styles.headlineArrow} aria-hidden="true">↗</span>
                    <span className={styles.srOnly}>Read on newyorkjets.com (opens in a new tab)</span>
                  </a>
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
