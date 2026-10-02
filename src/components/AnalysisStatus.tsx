import type { CurrentSnapshot } from "@/lib/current";
import { formatCheckedAt } from "@/lib/current";
import styles from "./FeedStatus.module.css";

export default function AnalysisStatus({ check }: { check: CurrentSnapshot["analysisCheck"] }) {
  if (!check || check.status === "ready") return null;
  return <div className={styles.status}><p className={styles.notice} role="status" aria-label="Play-by-play source status">
    {check.reason === "source-unavailable" ? "The latest play-by-play source check could not finish." : "New play-by-play is not published yet."}
    {" "}{check.status === "retained" ? "The last verified analysis remains in this edition." : "Current analysis will appear after a successful source check."}
    {check.checkedAt ? <> Last successful check: <time dateTime={check.checkedAt}>{formatCheckedAt(check.checkedAt)}</time>.</> : null}
    {" "}Results and team coverage are checked independently.
  </p></div>;
}
