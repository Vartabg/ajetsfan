import type { FeedState } from "@/lib/coverage";
import FeedStatusBadge from "./FeedStatusBadge";

export default function FeedStatus({ feed, label }: { feed: FeedState; label: string }) {
  const { checkedAt, status } = feed;
  return <FeedStatusBadge checkedAt={checkedAt} status={status} label={label} />;
}
