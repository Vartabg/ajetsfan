"use client";

import { useSyncExternalStore } from "react";
import type { FeedState } from "@/lib/coverage";
import { formatCheckedAt } from "@/lib/current";
import styles from "./FeedStatus.module.css";

const MINUTE = 60_000;
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const serverMinute = () => 0;
const subscribe = (notify: () => void) => {
  const interval = window.setInterval(notify, MINUTE);
  return () => window.clearInterval(interval);
};

export default function FeedStatus({ feed, label }: { feed: FeedState; label: string }) {
  const now = useSyncExternalStore(subscribe, currentMinute, serverMinute);
  const old = !!feed.checkedAt && !!now && now - Date.parse(feed.checkedAt) >= 24 * 60 * MINUTE;
  return <div className={styles.status}>
    <p>{label} {feed.checkedAt ? <>checked <time dateTime={feed.checkedAt}>{formatCheckedAt(feed.checkedAt)}</time>.</> : "has no successful source check in this edition."}</p>
    {feed.status !== "ready" || old ? <p className={styles.notice} role="status" aria-label={`${label} update status`}>{feed.status === "unavailable" ? "This source is unavailable. Coverage will appear after a successful refresh." : feed.status === "retained" ? "The latest source check failed. Showing the last verified snapshot; newer updates may be missing." : "This source check is over 24 hours old. Newer updates may be missing."}</p> : null}
  </div>;
}
