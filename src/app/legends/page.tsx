import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import LegendPortrait from "@/components/LegendPortrait";
import shared from "@/components/Focus.module.css";
import styles from "@/components/Legends.module.css";
import { filterLegends, legends, legendsCheckedAt, legendHonors, LEGEND_ERAS } from "@/lib/legends";
import { formatDate } from "@/lib/current";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../focus-fonts";

export const metadata = pageMetadata({ path: "/legends", title: "Jets legends — meet the people", description: "The faces and stories behind Jets history. Explore Ring of Honor members, Hall of Famers and retired-number honorees, with clear Jets years and original sources." });
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function LegendsPage({ searchParams }: Props) {
  const query = await searchParams;
  const q = first(query.q).trim().slice(0, 80);
  const honor = ["ring", "hall", "retired"].includes(first(query.honor)) ? first(query.honor) : "all";
  const era = LEGEND_ERAS.some((entry) => entry.value === first(query.era)) ? first(query.era) : "all";
  const people = filterLegends({ q, honor, era });
  const featured = legends.find((person) => person.slug === "curtis-martin") ?? legends.find((person) => person.photo) ?? legends[0];
  const filtered = !!q || honor !== "all" || era !== "all";
  return <FocusShell page="legends" section="/legends" entries={[
    { id: "legends", title: "Meet the people", answer: featured?.name ?? "Jets history" },
    { id: "people", title: "Everyone", answer: `${legends.length} people, different stories` },
    { id: "honors", title: "What the honors mean", answer: "Ring, Canton & retired numbers" },
  ]} checkedAt={null} className={`${focusFonts} ${styles.page}`}>
    <FocusMoment id="legends" first label="Jets history · the people" heading="Meet the Jets legends.">
      {featured ? <div className={styles.feature}>
        <LegendPortrait name={featured.name} photo={featured.photo} eager />
        <div className={styles.featureStory}>
          <p className={styles.eyebrow}>{featured.role} · Jets {featured.jetsYears}</p>
          <h2 className={styles.featureName}>{featured.name}</h2>
          <p className={styles.tagline}>{featured.tagline}</p>
          <p className={styles.intro}>{featured.intro}</p>
          <Link className={shared.go} href={`/legends/${featured.slug}`}>Meet {featured.name} <span aria-hidden="true">→</span></Link>
          <a className={shared.go} href="#people">Explore everyone <span aria-hidden="true">↓</span></a>
        </div>
      </div> : <p className={shared.caption}>The people archive is unavailable in this edition. Please check back soon.</p>}
    </FocusMoment>

    <FocusMoment id="people" label="Find a familiar face. Meet someone new." heading="Their stories belong here.">
      <form key={JSON.stringify([q, honor, era])} action="/legends#people" method="get" className={styles.filters} aria-label="Find Jets legends" data-focus-tools>
        <label htmlFor="legend-search">Name or role<input id="legend-search" name="q" type="search" defaultValue={q} maxLength={80} placeholder="Try a name or position" /></label>
        <label htmlFor="legend-honor">Honor<select id="legend-honor" name="honor" defaultValue={honor}>
          <option value="all">All honors</option><option value="ring">Jets Ring of Honor</option><option value="hall">Pro Football Hall of Fame</option><option value="retired">Jets retired numbers</option>
        </select></label>
        <label htmlFor="legend-era">Jets era<select id="legend-era" name="era" defaultValue={era}>
          <option value="all">All eras</option>{LEGEND_ERAS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select></label>
        <button type="submit">Find people</button>
      </form>
      <div className={styles.resultsHead}>
        <p role="status" aria-live="polite" data-legend-count>{people.length} of {legends.length} people{filtered ? " match these choices" : " in the archive"}.</p>
        {filtered ? <Link className={shared.go} href="/legends#people">Clear filters</Link> : null}
      </div>
      {people.length ? <ul className={styles.people} aria-label="Jets legends" data-legend-list>{people.map((person) => <li key={person.slug} data-legend-card={person.slug}>
        <article className={styles.card}>
          <LegendPortrait name={person.name} photo={person.photo} card />
          <div className={styles.cardStory}>
            <p className={styles.eyebrow}>{person.role} · Jets {person.jetsYears}</p>
            <h3><Link href={`/legends/${person.slug}`} className={styles.personLink}>{person.name} <span aria-hidden="true">→</span></Link></h3>
            <p>{person.tagline}</p>
            <ul className={styles.honors} aria-label={`${person.name}'s honors`}>{legendHonors(person).map((honor) => <li key={honor}>{honor}</li>)}</ul>
          </div>
        </article>
      </li>)}</ul> : <div className={styles.empty}>
        <h3>No people match those choices.</h3><p>Try a shorter name, another era, or clear the filters to see everyone.</p>
        <Link className={shared.go} href="/legends#people">Show everyone <span aria-hidden="true">→</span></Link>
      </div>}
    </FocusMoment>

    <FocusMoment id="honors" label="Different honors. The same human stories." heading="A place in Jets history.">
      <dl className={styles.honorGuide}>
        <div><dt>Jets Ring of Honor</dt><dd>The team&rsquo;s recognition of people who shaped its history. Ring induction years are labeled separately from Canton.</dd></div>
        <div><dt>Pro Football Hall of Fame</dt><dd>Canton honors a whole football career. A person&rsquo;s Jets years are shown here, including brief stays and separate stints.</dd></div>
        <div><dt>Jets retired numbers</dt><dd>A separate team honor. Dennis Byrd belongs in this archive through his retired No. 90.</dd></div>
      </dl>
      <p className={shared.caption}>This directory brings those three groups together. Biographies and honors checked <time dateTime={legendsCheckedAt}>{formatDate(legendsCheckedAt)}</time>. Every profile links to its original sources.</p>
      <p className={shared.caption}>Canton&rsquo;s Jets directory labels its list through September 2025; the 2026 class was checked separately. Ring membership follows the team&rsquo;s published induction record through its 2022 additions.</p>
    </FocusMoment>
  </FocusShell>;
}
