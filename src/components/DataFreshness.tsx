"use client";

import { useMinuteClock } from "@/lib/use-minute-clock";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The static edition still warns readers if its scheduled updater has stopped. */
export default function DataFreshness({ checkedAt }: { checkedAt: string }) {
  const now = useMinuteClock();
  const age = now - Date.parse(checkedAt);
  if (!now || age < DAY) return null;
  const days = Math.floor(age / DAY);
  return (
    <p role="status" aria-label="Results update status" style={{
      border: "1px solid var(--rule)", borderLeft: "4px solid var(--spot)",
      padding: "0.65rem 0.8rem", margin: "0.75rem 0", fontSize: "0.85rem",
    }}>
      <strong>Update overdue.</strong> This edition was last checked {days} {days === 1 ? "day" : "days"} ago.
      {" "}Results and scheduled matchups reflect that check; newer results may be missing.
    </p>
  );
}
