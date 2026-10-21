import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import LegendPortrait from "@/components/LegendPortrait";
import shared from "@/components/Focus.module.css";
import styles from "@/components/Legends.module.css";
import { legends, legendsCheckedAt, legendBySlug, legendHonors, type Legend } from "@/lib/legends";
import { formatDate } from "@/lib/current";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
function personFor(slug: string) {
  const person = legendBySlug(slug);
  if (!person) notFound();
  return person;
}
export function generateStaticParams() { return legends.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = personFor((await params).slug);
  return pageMetadata({ path: `/legends/${person.slug}`, title: `${person.name} — Jets legend`, description: `${person.name}, ${person.role}. Jets ${person.jetsYears}. ${person.tagline}` });
}

export default async function LegendPage({ params }: Props) {
  const person = personFor((await params).slug);
  const related = person.related.map(legendBySlug).filter((entry): entry is Legend => !!entry);
  const entries: FocusEntry[] = [
    { id: "person", title: "Meet the person", answer: person.name },
    { id: "story", title: "Their Jets story", answer: person.tagline },
    ...(related.length || person.archive.length ? [{ id: "connections", title: "The people around them", answer: "Explore the era" }] : []),
    { id: "sources", title: "Read the sources", answer: "Where the story comes from" },
  ];
  return <FocusShell page="legend" section="/legends" name={person.name} entries={entries} checkedAt={null} className={`${focusFonts} ${styles.page}`}>
    <FocusMoment id="person" first label={`${person.role} · Jets ${person.jetsYears}`} heading={person.name}>
      <div className={styles.feature}>
        <LegendPortrait name={person.name} photo={person.photo} eager />
        <div className={styles.featureStory}>
          <p className={styles.tagline}>{person.tagline}</p>
          <p className={styles.intro}>{person.intro}</p>
          <ul className={styles.honors} aria-label={`${person.name}'s honors`}>{legendHonors(person).map((honor) => <li key={honor}>{honor}</li>)}</ul>
          <Link className={shared.go} href="/legends#people"><span aria-hidden="true">←</span> Meet the other Jets legends</Link>
        </div>
      </div>
    </FocusMoment>

    <FocusMoment id="story" label="The person behind the name" heading="Their Jets story.">
      <div className={styles.story}><p>{person.why}</p></div>
      {person.moments.length ? <div className={styles.moments}>{person.moments.map((moment) => <article key={moment.title}>
        <h3>{moment.title}</h3><p>{moment.text}</p>
      </article>)}</div> : null}
      <p className={shared.caption}>Jets years: {person.jetsYears}. The honors above distinguish team recognition from Canton&rsquo;s whole-career recognition.</p>
    </FocusMoment>

    {related.length || person.archive.length ? <FocusMoment id="connections" label="Nobody builds a team alone" heading="Explore their Jets chapter.">
      {related.length ? <ul className={styles.related} aria-label={`People connected to ${person.name}`}>{related.map((other) => <li key={other.slug}>
        <Link href={`/legends/${other.slug}`}><span>{other.name}</span><small>{other.role} · Jets {other.jetsYears}</small><span aria-hidden="true">→</span></Link>
      </li>)}</ul> : null}
      {person.archive.length ? <nav className={styles.sourceLinks} aria-label={`${person.name} in the Jets archive`}>{person.archive.map((entry) => <Link key={entry.href} href={entry.href}>{entry.label} <span aria-hidden="true">→</span></Link>)}</nav> : null}
      <Link className={shared.go} href="/legends#people">Find another person <span aria-hidden="true">→</span></Link>
    </FocusMoment> : null}

    <FocusMoment id="sources" label="The story, on the record" heading="Read the original sources.">
      <p className={shared.caption}>These pages support the biography, Jets years and honors. Checked <time dateTime={legendsCheckedAt}>{formatDate(legendsCheckedAt)}</time>. Photograph credits appear with the image.</p>
      <nav className={styles.sourceLinks} aria-label={`Sources for ${person.name}`}>{person.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
        {source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
      </a>)}</nav>
      <Link className={shared.go} href="/legends#people"><span aria-hidden="true">←</span> Back to all Jets legends</Link>
    </FocusMoment>
  </FocusShell>;
}
