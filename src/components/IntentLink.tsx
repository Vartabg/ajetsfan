"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/** Keep route navigation native to Next, but warm large destinations on intent. */
export default function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [requested, setRequested] = useState<string | null>(null);
  const key = typeof href === "string" ? href : JSON.stringify(href);
  const localAnchor = typeof href === "string" && href.startsWith("#");
  const prepare = () => { if (!localAnchor) setRequested(key); };

  return <Link {...props} href={href} prefetch={!localAnchor && requested === key ? null : false}
    onMouseEnter={(event) => { onMouseEnter?.(event); if (!event.defaultPrevented) prepare(); }}
    onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) prepare(); }}
    onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) prepare(); }} />;
}
