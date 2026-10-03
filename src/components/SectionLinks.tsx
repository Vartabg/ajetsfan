"use client";

import Link from "./IntentLink";
import { usePathname } from "next/navigation";
import styles from "./Masthead.module.css";

const SECTIONS = [
  { href: "/", label: "Home" },
  { href: "/team", label: "Team" },
  { href: "/film-room", label: "Film Room" },
  { href: "/media", label: "Media" },
  { href: "/seasons", label: "Seasons" },
  { href: "/morgue", label: "The Morgue" },
];

export default function SectionLinks() {
  const pathname = usePathname();
  const within = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  const currentSection = within("/team") || within("/players") ? "/team"
    : ["/seasons", "/games", "/stories", "/history"].some(within) ? "/seasons"
    : within("/game-day") ? "/"
    : pathname;
  return SECTIONS.map((section) => (
    <Link key={section.href} href={section.href} pendingHint
      className={`${styles.section} label`}
      aria-current={currentSection === section.href ? "page" : undefined}>
      {section.label}
    </Link>
  ));
}
