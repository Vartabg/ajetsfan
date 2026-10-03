import Link from "./IntentLink";
import styles from "./ExploreHeader.module.css";

export default function ExploreHeader({ title, description, parent }: { title: string; description: string; parent?: { href: string; label: string } }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span>{parent ? <><Link href={parent.href}>{parent.label}</Link><span aria-hidden="true">/</span></> : null}<span aria-current="page">{title.replace(/\.$/, "")}</span></nav>
    <header className={styles.header}><h1 className="hed">{title}</h1><p>{description}</p></header>
  </>;
}
