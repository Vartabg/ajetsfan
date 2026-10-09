import Link from "@/components/IntentLink";
import NewsDesk from "@/components/NewsDesk";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import TeamFocusNavigation from "@/components/TeamFocusNavigation";
import shared from "@/components/Focus.module.css";
import { loadCoverage } from "@/lib/load-coverage";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import styles from "../focus.module.css";

export const metadata = pageMetadata({ path: "/team/news", title: "Jets Team News — The Back Page", description: "Dated official Jets headlines, with direct links to the original reporting." });

export default async function TeamNewsPage() {
  const coverage = await loadCoverage();
  return <FocusShell page="team-news" section="/team" className={focusFonts} checkedAt={coverage?.news.checkedAt ?? null}
    entries={[{ id: "news-desk", title: "Team news", answer: coverage ? `${coverage.news.items.length} official headlines` : "Pending" }]}>
    <FocusMoment id="news-desk" first label="From Florham Park" heading="Team news." status={<TeamFocusNavigation />}
      actions={<Link className={shared.go} href="/how-made">Sources &amp; definitions <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>Official team headlines. For beat writers, radio and video, visit the <Link href="/media">Media Room</Link>.</p>
      {coverage ? <div className={styles.content}><NewsDesk feed={coverage.news} limit={coverage.news.items.length} externalHeadingId="news-desk-heading" /></div> : <p className={shared.caption}>Official team headlines will appear after the next successful source check.</p>}
    </FocusMoment>
  </FocusShell>;
}
