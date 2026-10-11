import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import RantShelf from "@/components/RantShelf";
import shared from "@/components/Focus.module.css";
import { mediaCollection } from "@/lib/media-catalog";
import { isJetsRant } from "@/lib/media-topics.mjs";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import styles from "../page.module.css";

export const metadata = pageMetadata({ path: "/media/rants", title: "Jets Rants — the meltdowns worth revisiting", description: "Revisit memorable Jets rants from Joe Benigno, Don La Greca, Brandon Tierney, Sal Licata, Mike Francesa and other voices. Play the original clips right here, alongside fresh reactions." });

export default function JetsRantsPage() {
  const { items, outlets } = mediaCollection;
  const classics = items.filter((item) => item.topics.includes("Rants") && !item.id.startsWith("auto-"));
  const fresh = items.filter((item) => item.id.startsWith("auto-") && (item.kind === "video" || item.kind === "audio") && isJetsRant(item.title))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id)).slice(0, 8);
  return <FocusShell page="media" className={`${focusFonts} ${styles.media}`} checkedAt={null} entries={[
    { id: "about", title: "Jets Rants", answer: "The frustration, on tape" },
    { id: "classics", title: "The classics", answer: `${classics.length} picks` },
    { id: "fresh", title: "Fresh frustration", answer: "New releases" },
  ]}>
    <FocusMoment id="about" first label="The fan archive" heading="Jets Rants">
      <p className={styles.rantIntro}>Bad losses. Broken promises. Radio losing its mind. Memorable outbursts from the people who have lived it.</p>
      <Link href="/media" className={styles.backLink}>All media <span aria-hidden="true">↗</span></Link>
    </FocusMoment>
    <FocusMoment id="classics" label="Worth revisiting" heading="The classics">
      <p className={shared.caption}>Selected original broadcasts and creator recordings. The dates describe the uploads; each clip keeps its own context.</p>
      <RantShelf items={classics} outlets={outlets} />
    </FocusMoment>
    <FocusMoment id="fresh" label="Updated automatically" heading="Fresh frustration">
      <p className={shared.caption}>New Jets releases join this shelf when the publisher’s headline identifies a rant, meltdown or outburst.</p>
      {fresh.length ? <RantShelf items={fresh} outlets={outlets} /> : <p className={shared.caption}>The next qualifying release will appear here after the feed check.</p>}
    </FocusMoment>
  </FocusShell>;
}
