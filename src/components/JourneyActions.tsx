"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import IntentLink from "./IntentLink";
import { JOURNEY_STEPS, journeyHref, journeyPosition } from "@/lib/miracle-journey";
import {
  JOURNEY_LOCATION_EVENT,
  getBookmarkServerSnapshot,
  getBookmarkSnapshot,
  getJourneyLocationServerSnapshot,
  getJourneyLocationSnapshot,
  parseBookmark,
  removeBookmark,
  subscribeBookmark,
  subscribeJourneyLocation,
  writeBookmark,
} from "@/lib/journey-bookmark";
import styles from "./JourneyActions.module.css";

const subscribeHydration = () => () => {};
const clientHydration = () => true;
const serverHydration = () => false;

function stepShort(step: string): string {
  return JOURNEY_STEPS.find((entry) => entry.id === step)?.short ?? step;
}

/** Homepage resume control. Renders null on the server and whenever no valid record exists. */
export function JourneyResume() {
  const raw = useSyncExternalStore(subscribeBookmark, getBookmarkSnapshot, getBookmarkServerSnapshot);
  const record = useMemo(() => parseBookmark(raw), [raw]);
  if (!record) return null;
  return (
    <p className={styles.resume}>
      <IntentLink href={journeyHref(record)} className={styles.resumeLink}>
        Continue your saved journey
      </IntentLink>
      <span className={styles.resumeStep}>{stepShort(record.step)}</span>
    </p>
  );
}

export default function JourneyActions({ maxMoment }: { maxMoment: number }) {
  // Subscribes to App Router navigations so step changes re-render even when
  // the location store below receives no direct event for a router push.
  const routerSearch = useSearchParams().toString();
  useEffect(() => {
    // App Router commits its address after rendering the destination. Notify
    // the location store after that commit as well as on native story changes.
    window.dispatchEvent(new Event(JOURNEY_LOCATION_EVENT));
  }, [routerSearch]);
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydration, serverHydration);
  const search = useSyncExternalStore(
    subscribeJourneyLocation,
    getJourneyLocationSnapshot,
    getJourneyLocationServerSnapshot,
  );
  const raw = useSyncExternalStore(subscribeBookmark, getBookmarkSnapshot, getBookmarkServerSnapshot);
  const record = useMemo(() => parseBookmark(raw), [raw]);
  const position = useMemo(
    () => journeyPosition(hydrated ? search : "", maxMoment),
    [hydrated, search, maxMoment],
  );
  const currentHref = useMemo(() => journeyHref(position), [position]);
  const [saveFeedback, setSaveFeedback] = useState<{ href: string; message: string } | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{ href: string; message: string; fallback: string } | null>(null);
  const shareRequest = useRef(0);
  const lastHref = useRef<string | null>(null);
  const saveNotice = saveFeedback?.href === currentHref ? saveFeedback.message : "";
  const shareStatus = shareFeedback?.href === currentHref ? shareFeedback.message : "";
  const shareFallback = shareFeedback?.href === currentHref ? shareFeedback.fallback : "";
  const savedElsewhere = record && journeyHref(record) !== currentHref;

  // Persist only location changes in this tab. A storage notification from a
  // different tab must never overwrite its newer place or resurrect a removal.
  useEffect(() => {
    if (!hydrated || search !== window.location.search) return;
    const previous = lastHref.current;
    lastHref.current = currentHref;
    if (previous === null || previous === currentHref) return;
    shareRequest.current += 1;
    if (parseBookmark(getBookmarkSnapshot())) writeBookmark(position);
  }, [hydrated, currentHref, position, search]);

  const saved = record !== null;

  function notice(message: string) { setSaveFeedback({ href: currentHref, message }); }

  function toggleSave() {
    if (record) {
      if (removeBookmark()) {
        notice("Removed your saved journey from this device.");
      } else {
        notice(
          "This device couldn't remove your saved journey, so it is still saved. The journey links still work.",
        );
      }
      return;
    }
    if (writeBookmark(position)) {
      notice("Journey saved on this device. It updates as you keep exploring.");
    } else {
      notice("This device couldn't save your place. The journey links still work.");
    }
  }

  async function share() {
    const request = ++shareRequest.current;
    const requestedHref = currentHref;
    let url: string;
    try {
      url = new URL(requestedHref, window.location.origin).href;
    } catch {
      if (shareRequest.current === request) setShareFeedback({ href: currentHref, message: "Couldn't build a link for this step.", fallback: "" });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      if (shareRequest.current !== request) return;
      if (journeyHref(journeyPosition(window.location.search, maxMoment)) !== requestedHref) return;
      setShareFeedback({ href: requestedHref, message: "Your browser blocked copying. Select the link below to copy it.", fallback: url });
      return;
    }
    if (shareRequest.current !== request) return;
    if (journeyHref(journeyPosition(window.location.search, maxMoment)) !== requestedHref) return;
    setShareFeedback({ href: requestedHref, message: "Journey link copied.", fallback: "" });
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.button}
        aria-pressed={saved}
        disabled={!hydrated}
        onClick={toggleSave}
      >
        {saved ? "Remove saved journey" : "Save this journey"}
      </button>
      <button type="button" className={styles.button} disabled={!hydrated} onClick={share}>
        Share this step
      </button>
      {saveNotice ? (
        <p role="status" aria-label="Save status" className={styles.status}>
          {saveNotice}
        </p>
      ) : null}
      {savedElsewhere ? <p className={styles.status}>Your saved place is still at {stepShort(record.step)}. This selection has not been saved on this device.</p> : null}
      <p className={styles.note}>Saved only in this browser. You can return from the homepage.</p>
      {shareStatus ? (
        <p role="status" aria-label="Share status" className={styles.status}>
          {shareStatus}
        </p>
      ) : null}
      {shareFallback ? (
        <label className={styles.fallback}>
          Journey link
          <input
            type="text"
            readOnly
            value={shareFallback}
            aria-label="Journey link"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </div>
  );
}
