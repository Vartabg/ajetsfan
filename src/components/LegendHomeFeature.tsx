import Link from "./IntentLink";
import FocusMoment from "./FocusMoment";
import LegendPortrait from "./LegendPortrait";
import { legendBySlug } from "@/lib/legends";
import shared from "./Focus.module.css";
import styles from "./Legends.module.css";

/** Keep the full story catalog on the server; the home page meets one person. */
export default function LegendHomeFeature() {
  const person = legendBySlug("curtis-martin");
  if (!person) return null;
  return <FocusMoment id="people" label="The people behind the Jets" heading={person.name}
    actions={<><Link href={`/legends/${person.slug}`} className={shared.go}>Meet Curtis <span aria-hidden="true">→</span></Link>
      <Link href="/legends" className={shared.go}>All Jets legends <span aria-hidden="true">→</span></Link></>}>
    <div className={styles.feature}>
      <LegendPortrait name={person.name} photo={person.photo} />
      <div className={styles.featureStory}><p className={styles.eyebrow}>{person.role} · Jets {person.jetsYears}</p>
        <p className={styles.tagline}>{person.tagline}</p><p className={styles.intro}>{person.intro}</p></div>
    </div>
  </FocusMoment>;
}
