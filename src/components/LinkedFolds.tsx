"use client";

import { useEffect, useLayoutEffect } from "react";

const KEY = "openFolds";
const folds = () => [...document.querySelectorAll<HTMLDetailsElement>("details[data-fold][id]")];

/**
 * The page's remembered folds (`details[data-fold]` with an id). The years a reader opened are saved with the
 * history entry, so Back returns them open where they left off. A link to a closed fold opens it: on arrival,
 * on hash change, and just before a same-page link jumps there. Without scripts the folds stay native disclosures.
 */
export default function LinkedFolds() {
  // Before paint, so the browser restores the reading position onto the page as the reader left it.
  useLayoutEffect(() => {
    const saved = (window.history.state as Record<string, unknown> | null)?.[KEY];
    if (Array.isArray(saved)) for (const fold of folds()) fold.open = saved.includes(fold.id);
  }, []);

  useEffect(() => {
    let frame = 0;
    const restored = Array.isArray((window.history.state as Record<string, unknown> | null)?.[KEY]);
    const foldFor = (href: string) => {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return null;
      let id: string;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { return null; }
      const target = document.getElementById(id);
      const fold = target?.closest<HTMLDetailsElement>("details[data-fold]");
      return target && fold ? { target, fold } : null;
    };
    const reveal = () => {
      const linked = foldFor(window.location.href);
      if (!linked || linked.fold.open) return;
      linked.fold.open = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => linked.target.scrollIntoView({ block: "start", behavior: "instant" }));
    };
    const openBeforeJump = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      const linked = link && link.target !== "_blank" ? foldFor(link.href) : null;
      if (linked) linked.fold.open = true;
    };
    // `toggle` does not bubble, so it is heard on the way down. The history state keeps the router's own keys.
    const remember = (event: Event) => {
      if (!(event.target instanceof HTMLDetailsElement) || !event.target.matches("details[data-fold][id]")) return;
      window.history.replaceState({ ...window.history.state, [KEY]: folds().filter((fold) => fold.open).map((fold) => fold.id) }, "");
    };
    // A page restored from history keeps the reader's own folds; only a fresh arrival opens the linked one.
    if (!restored) reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", openBeforeJump, true);
    document.addEventListener("toggle", remember, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", openBeforeJump, true);
      document.removeEventListener("toggle", remember, true);
    };
  }, []);
  return null;
}
