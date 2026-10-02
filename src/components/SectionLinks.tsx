"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Masthead.module.css";

const SECTIONS = [
  { href: "/", label: "The Back Page" },
  { href: "/team", label: "Around the Jets" },
  { href: "/film-room", label: "Film Room" },
  { href: "/media", label: "Media Room" },
  { href: "/seasons", label: "Seasons" },
  { href: "/morgue", label: "The Morgue" },
];

export default function SectionLinks() {
  const pathname = usePathname();
  const currentSection = pathname.startsWith("/games/") ? "/morgue" : pathname.startsWith("/players/") ? "/team" : pathname.startsWith("/seasons/") ? "/seasons" : pathname;
  return SECTIONS.map((section, index) => (
    <Link key={section.href} href={section.href}
      className={`${styles.section} label`}
      aria-current={currentSection === section.href ? "page" : undefined}>
      <span className={styles.chapter} aria-hidden="true">0{index + 1}</span>{section.label}
    </Link>
  ));
}
