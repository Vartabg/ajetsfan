import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import InlineMedia from "@/components/InlineMedia";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import MediaRoom, { RoomLink } from "@/components/MediaRoom";
import shared from "@/components/Focus.module.css";
import { formatMediaDate, type MediaItem } from "@/lib/media";
import { mediaCollection } from "@/lib/media-catalog";
import { mediaPlayback } from "@/lib/media-playback";
import { compactMediaItem } from "@/lib/media-asset-paths.mjs";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../focus-fonts";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/media", title: "Jets Media Room — fan voices, WFAN, reporting and film", description: "Watch and listen to independent Jets creators, WFAN shows and dated reporting in place. Mixed sports segments are included when they cover the Jets. Filter by source, season, topic or format." });

const FORMATS: { kind: MediaItem["kind"]; id: string; title: string; one: string; many: string }[] = [
  { kind: "video", id: "watch", title: "Watch", one: "video", many: "videos" },
  { kind: "article", id: "read", title: "Read", one: "article", many: "articles" },
  { kind: "audio", id: "listen", title: "Listen", one: "show", many: "shows" },
  { kind: "post", id: "posts", title: "Posts", one: "post", many: "posts" },
];
export default function MediaPage() {
  const { items, outlets } = mediaCollection;
  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const used = outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id));
  const newest = [...items].filter((item) => item.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
  const formats = FORMATS.map((format) => ({ ...format, count: items.filter((item) => item.kind === format.kind).length,
    lead: (format.kind === "video" || format.kind === "audio" ? newest.find((item) => item.kind === format.kind && mediaPlayback(item)) : null) ?? newest.find((item) => item.kind === format.kind) }))
    .filter((format) => format.lead);

  const entries: FocusEntry[] = [
    { id: "about", title: "Media Room", answer: `${items.length} stories` },
    ...formats.map((format) => ({ id: format.id, title: format.title, answer: outletById.get(format.lead!.outletId)?.name ?? format.lead!.author })),
    { id: "collection", title: "The collection", answer: "Search and filter" },
  ];

  return <FocusShell page="media" entries={entries} checkedAt={null} className={`${focusFonts} ${styles.media}`}>
    <FocusMoment id="about" first label="Fan voices · Radio · Reporting" heading="Media Room">
      <div className={styles.intro}>
        <ul className={styles.formats}>{formats.map((format) => <li key={format.kind}>
          <a href={`#${format.id}`} aria-label={`${format.title}: ${format.count} ${format.count === 1 ? format.one : format.many}`}><b>{format.title}</b><span>{format.count}</span></a>
        </li>)}</ul>
        <div className={styles.introFooter}><p className={styles.introNote}>{items.length} stories · {used.length} sources · Updated automatically</p><Link href="/media/rants" className={styles.rantLink}>Jets Rants <span aria-hidden="true">↗</span></Link></div>
      </div>
    </FocusMoment>

    {formats.map((format) => {
      const item = format.lead!;
      return <FocusMoment key={format.kind} id={format.id} label={`${format.title} · ${outletById.get(item.outletId)?.name ?? item.author} · ${formatMediaDate(item.publishedAt)}`} heading={item.title}
        actions={<>
          <RoomLink type={format.kind} className={shared.go}>Every {format.one} ({format.count}) <span aria-hidden="true">↓</span></RoomLink>
        </>}>
        <figure className={shared.shape}>
          <InlineMedia item={compactMediaItem(item)} outletName={outletById.get(item.outletId)?.name} feature sizes="(max-width: 959px) calc(100vw - 32px), 760px" preview={item.kind !== "post"} />
          <figcaption>{item.summary.split(/(?<=\.)\s/)[0]}</figcaption>
        </figure>
      </FocusMoment>;
    })}

    <FocusMoment id="collection" label="The collection" heading={<>Search every story. <em>Filter by source, season or topic.</em></>}>
      <div className={styles.room} data-focus-tools><MediaRoom items={items.map(compactMediaItem)} outlets={outlets} checkedAt={mediaCollection.checkedAt} sources={mediaCollection.sources} curatedCheckedAt={mediaCollection.curatedCheckedAt} /></div>
    </FocusMoment>
  </FocusShell>;
}
