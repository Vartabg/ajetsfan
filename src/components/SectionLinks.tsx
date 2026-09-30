"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Masthead.module.css";

const SECTIONS = [
  { href: "/", label: "The Back Page" },
  { href: "/team", label: "Around the Jets" },
  { href: "/morgue", label: "The Morgue" },
];

export default function SectionLinks() {
  const pathname = usePathname();
  return SECTIONS.map((section) => (
    <Link key={section.href} href={section.href}
      className={`${styles.section} label`}
      aria-current={pathname === section.href ? "page" : undefined}>
      {section.label}
    </Link>
  ));
}
