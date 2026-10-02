import Link from "next/link";
import MediaRoom from "@/components/MediaRoom";
import { mediaCollection } from "@/lib/media-catalog";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/media", title: "Jets Media Room — beat reporting, TV, radio and film", description: "Explore dated Jets coverage from beat reporters, SNY, WFAN, ESPN New York, official film and independent analysis. Filter by season, topic, source and format; open original posts and videos." });

export default function MediaPage() {
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><span>Media Room</span></nav>
    <header className={styles.header}><h1 className="hed">Media Room<span aria-hidden="true">.</span></h1><p>Reporting, film and the New York conversation.</p></header>
    <MediaRoom items={mediaCollection.items} outlets={mediaCollection.outlets} checkedAt={mediaCollection.checkedAt} />
  </main>;
}
