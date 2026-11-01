import FocusMoment from "./FocusMoment";
import Link from "./IntentLink";
import { JourneyResume } from "./JourneyActions";
import { JOURNEY_PATH } from "@/lib/miracle-journey";
import shared from "./Focus.module.css";
import styles from "./MiracleJourney.module.css";

export default function JourneyHome() {
  return <FocusMoment id="miracle" first label="October 23, 2000 · A Jets story in three parts"
    heading={<>The Monday <em>Night Miracle.</em></>}
    actions={<><Link href={JOURNEY_PATH} className={`${shared.button} ${styles.entry}`} pendingHint>Follow the comeback <span aria-hidden="true">→</span></Link><Link href="/puzzle" className={shared.go}>Play today’s puzzle</Link></>}>
    <p className={styles.intro}>Follow the rally from 30–7 down, through Jumbo Elliott’s catch, to John Hall’s winning kick. Then explore how Cleveland became another unlikely Jets win.</p>
    <figure className={styles.scoreboard} aria-label="Miami led 30 to 7 after three quarters. The Jets won 40 to 37 in overtime.">
      <div><span>After three quarters</span><p><b>NYJ</b><strong>7</strong><b>MIA</b><strong>30</strong></p></div>
      <span className={styles.scoreArrow} aria-hidden="true">→</span>
      <div><span>Final · overtime</span><p><b>NYJ</b><strong>40</strong><b>MIA</b><strong>37</strong></p></div>
      <figcaption>Relive the rally. Explore the catch. Compare the comebacks.</figcaption>
    </figure>
    <JourneyResume />
  </FocusMoment>;
}
