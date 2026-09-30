"use client";

import type { FeedState } from "@/lib/coverage";
import { formatCheckedAt } from "@/lib/current";
import { useMinuteClock } from "@/lib/use-minute-clock";
import styles from "./FeedStatus.module.css";

export default function FeedStatusBadge({ checkedAt, status, label }: Pick<FeedState, "checkedAt" | "status"> & { label: string }) {
  const now = useMinuteClock();
  const old = !!checkedAt && !!now && now - Date.parse(checkedAt) >= 24 * 60 * 60_000;
  return <div className={styles.status}>
    <p>{label} {checkedAt ? <>checked <time dateTime={checkedAt}>{formatCheckedAt(checkedAt)}</time>.</> : "has no successful source check in this edition."}</p>
    {status !== "ready" || old ? <p className={styles.notice} role="status" aria-label={`${label} update status`}>{status === "unavailable" ? "This source is unavailable. Coverage will appear after a successful refresh." : status === "retained" ? "The latest source check failed. Showing the last verified snapshot; newer updates may be missing." : "This source check is over 24 hours old. Newer updates may be missing."}</p> : null}
  </div>;
}
