"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isFocusRoute } from "@/lib/site-sections";

/** Focus pages carry their own navigation; the rest keep the site header and footer for now. */
export default function SiteChrome({ children }: { children: ReactNode }) {
  return isFocusRoute(usePathname()) ? null : children;
}
