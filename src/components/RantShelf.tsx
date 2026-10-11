import InlineMedia from "./InlineMedia";
import { compactMediaItem } from "@/lib/media-asset-paths.mjs";
import { formatMediaDate, type MediaItem, type MediaOutlet } from "@/lib/media";
import styles from "./RantShelf.module.css";

export default function RantShelf({ items, outlets }: { items: MediaItem[]; outlets: MediaOutlet[] }) {
  const names = new Map(outlets.map((outlet) => [outlet.id, outlet.name]));
  return <div className={styles.shelf} data-rant-shelf>{items.map((item) => {
    const source = names.get(item.outletId) ?? item.author;
    return <article className={styles.card} key={item.id} data-rant-card={item.id}>
      <p className={styles.voice}>{item.author}{item.author === source ? "" : ` · ${source}`}</p>
      <h3>{item.title}</h3>
      <p className={styles.date}>{formatMediaDate(item.publishedAt)}</p>
      <InlineMedia item={compactMediaItem(item)} outletName={source} sizes="(max-width: 959px) calc(100vw - 32px), 460px" />
      <p className={styles.context}>{item.summary}</p>
    </article>;
  })}</div>;
}
