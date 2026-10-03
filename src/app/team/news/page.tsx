import Link from "@/components/IntentLink";
import NewsDesk from "@/components/NewsDesk";
import { loadCoverage } from "@/lib/load-coverage";
import { pageMetadata } from "@/lib/site";
import styles from "../page.module.css";

export const metadata = pageMetadata({ path: "/team/news", title: "Jets Team News — The Back Page", description: "Dated official Jets headlines, with direct links to the original reporting." });

export default async function TeamNewsPage() {
  const coverage = await loadCoverage();
  return <>
    <header className={styles.pageHeader}><p className={styles.kicker}>From Florham Park</p><h1 id="news-desk-heading" className="hed" tabIndex={-1}>Team news.</h1><p>Official team headlines. For beat writers, radio and video, visit the <Link href="/media">Media Room</Link>.</p></header>
    {coverage ? <div className={styles.pageContent}><NewsDesk feed={coverage.news} limit={coverage.news.items.length} externalHeadingId="news-desk-heading" /></div> : <p className={styles.empty}>Official team headlines will appear after the next successful source check.</p>}
  </>;
}
