import type { SnapFacts } from "./snap-types";

/** A touchdown also converts the down. An absent first-down credit leaves the outcome unknown. */
export function converted(facts: SnapFacts | undefined): boolean | null {
  if (facts?.touchdown === true) return true;
  return typeof facts?.firstDown === "boolean" ? facts.firstDown : null;
}
