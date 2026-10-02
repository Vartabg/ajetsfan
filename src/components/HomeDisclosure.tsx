"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "@/app/page.module.css";

/** Native disclosure keeps the server-rendered content usable without scripts. */
export default function HomeDisclosure({ target, label, hint, children }: { target: string; label: string; hint?: string; children: ReactNode }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let frame = 0;
    const linkedTarget = (href: string) => {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return null;
      let id: string;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { return null; }
      const element = document.getElementById(id);
      return element && disclosure.current?.contains(element) ? element : null;
    };
    const reveal = () => {
      const element = linkedTarget(window.location.href);
      if (!element || !disclosure.current) return;
      disclosure.current.open = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => element.scrollIntoView({ block: "start", behavior: "instant" }));
    };
    const openBeforeNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link && link.target !== "_blank" && linkedTarget(link.href) && disclosure.current) disclosure.current.open = true;
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    window.addEventListener("popstate", reveal);
    document.addEventListener("click", openBeforeNavigation, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", reveal);
      window.removeEventListener("popstate", reveal);
      document.removeEventListener("click", openBeforeNavigation, true);
    };
  }, []);

  return <details ref={disclosure} className={styles.homeDisclosure} data-home-disclosure={target}>
    <summary><span>{label}{hint ? <small>{hint}</small> : null}</span><span className={styles.disclosureMark} aria-hidden="true">+</span></summary>
    <div>{children}</div>
  </details>;
}
