"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** The home page is a full-screen focus view with its own navigation; every other page keeps the site header and footer. */
export default function SiteChrome({ children }: { children: ReactNode }) {
  return usePathname() === "/" ? null : children;
}
