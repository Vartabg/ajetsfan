import { JOURNEY_STEPS, type JourneyPosition, type JourneyStep } from "./miracle-journey";

/** The one localStorage key for the Monday Night Miracle bookmark. */
export const JOURNEY_STORAGE_KEY = "ajetsfan:miracle-journey:v1";

export const JOURNEY_BOOKMARK_VERSION = 1;

/** Same-window fan-out; cross-tab sync arrives through the storage event. */
export const JOURNEY_BOOKMARK_EVENT = "ajetsfan:journey-bookmark";

/** Dispatched by VisualGameStory whenever its selected moment changes. */
export const VISUAL_STORY_SELECTION_EVENT = "ajetsfan:visual-story-selection";
export const JOURNEY_LOCATION_EVENT = "ajetsfan:journey-location";

export type JourneyBookmark = {
  version: 1;
  step: JourneyStep;
  moment: number;
  progress: number;
};

const STEP_IDS = new Set<string>(JOURNEY_STEPS.map((step) => step.id));

function validBookmark(value: unknown): value is JourneyBookmark {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === JOURNEY_BOOKMARK_VERSION &&
    typeof record.step === "string" &&
    STEP_IDS.has(record.step) &&
    Number.isSafeInteger(record.moment) &&
    (record.moment as number) >= 1 &&
    (record.moment as number) <= 10000 &&
    Number.isInteger(record.progress) &&
    (record.progress as number) >= 0 &&
    (record.progress as number) <= 100
  );
}

/** Parse a raw store snapshot; corruption and version mismatch read as absent. */
export function parseBookmark(raw: string | null): JourneyBookmark | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return validBookmark(value) ? value : null;
  } catch {
    return null;
  }
}

/** Raw string snapshot for useSyncExternalStore; parsing stays outside getSnapshot. */
export function getBookmarkSnapshot(): string | null {
  try {
    return window.localStorage.getItem(JOURNEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getBookmarkServerSnapshot(): null {
  return null;
}

/** Same-window custom event plus cross-tab storage events. Never resurrects removals. */
export function subscribeBookmark(notify: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== JOURNEY_STORAGE_KEY) return;
    notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(JOURNEY_BOOKMARK_EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(JOURNEY_BOOKMARK_EVENT, notify);
  };
}

/** Location changes that bypass the router: back/forward and visual-story selection. */
export function subscribeJourneyLocation(notify: () => void): () => void {
  window.addEventListener("popstate", notify);
  window.addEventListener(VISUAL_STORY_SELECTION_EVENT, notify);
  window.addEventListener(JOURNEY_LOCATION_EVENT, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener(VISUAL_STORY_SELECTION_EVENT, notify);
    window.removeEventListener(JOURNEY_LOCATION_EVENT, notify);
  };
}

export function getJourneyLocationSnapshot(): string {
  return window.location.search;
}

export function getJourneyLocationServerSnapshot(): string {
  return "";
}

function store(record: JourneyBookmark): boolean {
  try {
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(JOURNEY_BOOKMARK_EVENT));
  return true;
}

/** Persist the current place; false means storage failed and nothing claims success. */
export function writeBookmark(position: JourneyPosition): boolean {
  return store({
    version: JOURNEY_BOOKMARK_VERSION,
    step: position.step,
    moment: position.moment,
    progress: position.progress,
  });
}

/** Remove the saved place; false means storage failed and the record may still be saved. */
export function removeBookmark(): boolean {
  try {
    window.localStorage.removeItem(JOURNEY_STORAGE_KEY);
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(JOURNEY_BOOKMARK_EVENT));
  return true;
}
