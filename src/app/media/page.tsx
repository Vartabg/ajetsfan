import FocusMoment from "@/components/FocusMoment";
import FocusPicture from "@/components/FocusPicture";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import MediaRoom, { RoomLink } from "@/components/MediaRoom";
import shared from "@/components/Focus.module.css";
import { formatMediaDate, mediaImage, type MediaItem, type MediaOutlet } from "@/lib/media";
import { mediaCollection } from "@/lib/media-catalog";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../focus-fonts";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/media", title: "Jets Media Room — beat reporting, TV, radio and film", description: "Explore dated Jets coverage from beat reporters, SNY, WFAN, ESPN New York, official film and independent analysis. Filter by season, topic, source and format; open or compare the original reporting." });

const FORMATS: { kind: MediaItem["kind"]; id: string; title: string; one: string; many: string }[] = [
  { kind: "video", id: "watch", title: "Watch", one: "video", many: "videos" },
  { kind: "article", id: "read", title: "Read", one: "article", many: "articles" },
  { kind: "audio", id: "listen", title: "Listen", one: "show", many: "shows" },
  { kind: "post", id: "posts", title: "Posts", one: "post", many: "posts" },
];
const VOICES: Record<MediaOutlet["kind"], string> = { beat: "beat reporters", tv: "TV", radio: "radio", official: "the team", independent: "independent film study" };

const list = (parts: string[]) => parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";

export default function MediaPage() {
  const { items, outlets } = mediaCollection;
  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const used = outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id));
  const newest = [...items].filter((item) => item.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
  const formats = FORMATS.map((format) => ({ ...format, count: items.filter((item) => item.kind === format.kind).length, lead: newest.find((item) => item.kind === format.kind && (format.kind === "post" || mediaImage(item))) ?? newest.find((item) => item.kind === format.kind) }))
    .filter((format) => format.lead);
  const [opener] = formats;

  const entries: FocusEntry[] = [
    { id: "about", title: "Media Room", answer: `${items.length} stories` },
    ...formats.map((format) => ({ id: format.id, title: format.title, answer: outletById.get(format.lead!.outletId)?.name ?? format.lead!.author })),
    { id: "collection", title: "The collection", answer: "Search and filter" },
  ];

  return <FocusShell page="media" entries={entries} checkedAt={null} className={focusFonts}>
    <FocusMoment id="about" first label="Media Room" heading={<>Jets coverage, <em>from the people who cover them.</em></>}
      actions={opener ? <a href={`#${opener.id}`} className={shared.go}>Start with the newest {opener.one} <span aria-hidden="true">↓</span></a> : null}>
      <div className={shared.shape}>
        <ul className={styles.formats}>{formats.map((format) => <li key={format.kind}>
          <a href={`#${format.id}`}><b>{format.title}</b><span>{format.count} {format.count === 1 ? format.one : format.many}</span></a>
        </li>)}</ul>
        <p className={shared.caption}>{items.length} selected stories from {used.length} outlets: {list([...new Set(used.map((outlet) => VOICES[outlet.kind]))])}. Every story opens its original source.</p>
      </div>
    </FocusMoment>

    {formats.map((format) => {
      const item = format.lead!;
      // A post's attached picture often belongs to something else, so posts stay text, as they do in the room.
      const image = format.kind === "post" ? null : mediaImage(item);
      return <FocusMoment key={format.kind} id={format.id} label={`${format.title} · ${outletById.get(item.outletId)?.name ?? item.author} · ${formatMediaDate(item.publishedAt)}`} heading={item.title}
        actions={<>
          <RoomLink media={item.id} className={shared.go}>Open it here <span aria-hidden="true">↓</span></RoomLink>
          <RoomLink type={format.kind} className={shared.go}>Every {format.one} ({format.count}) <span aria-hidden="true">↓</span></RoomLink>
        </>}>
        <figure className={shared.shape}>
          {image ? <FocusPicture image={image} /> : null}
          <figcaption>{item.summary.split(/(?<=\.)\s/)[0]}</figcaption>
        </figure>
      </FocusMoment>;
    })}

    <FocusMoment id="collection" label="The collection" heading={<>Search every story. <em>Filter by source, season or topic.</em></>}>
      <div className={styles.room} data-focus-tools><MediaRoom items={items} outlets={outlets} checkedAt={mediaCollection.checkedAt} /></div>
    </FocusMoment>
  </FocusShell>;
}
