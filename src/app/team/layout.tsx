import type { ReactNode } from "react";
import TeamFrame from "@/components/TeamFrame";

export default function TeamLayout({ children }: { children: ReactNode }) {
  return <TeamFrame>{children}</TeamFrame>;
}
