import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return <main id="main" className={styles.main}>
    <span className={styles.number} aria-hidden="true">404</span>
    <div className={styles.copy}>
      <p className={styles.kicker}>Missed assignment</p>
      <h1>Blown coverage.</h1>
      <p>The page you’re looking for isn’t here. The football is.</p>
      <nav aria-label="Find your way back"><Link href="/">Back to the Back Page <span aria-hidden="true">↗</span></Link><Link href="/morgue">Visit the Morgue <span aria-hidden="true">↗</span></Link></nav>
    </div>
  </main>;
}
