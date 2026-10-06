"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FOCUS_ROUTES } from "@/lib/site-sections";

/** Focus pages carry their own navigation; the rest keep the site header and footer for now. */
export default function SiteChrome({ children }: { children: ReactNode }) {
  return FOCUS_ROUTES.includes(usePathname()) ? null : children;
}
