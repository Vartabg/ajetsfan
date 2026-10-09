"use client";

import Link from "next/link";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import { focusFonts } from "@/app/focus-fonts";
import shared from "@/components/Focus.module.css";

export default function ErrorRecovery({ retry }: { retry: () => void }) {
  return <FocusShell page="error" entries={[{ id: "retry", title: "A delay", answer: "Try the page again" }]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="retry" first label="A delay in the press room" heading={<>Page temporarily <em>unavailable.</em></>}
      actions={<><button className={shared.button} type="button" onClick={retry}>Try again</button><Link className={shared.go} href="/">Back to the front page →</Link></>}>
      <p className={shared.caption}>This page couldn’t finish loading. Try again, or head back to the front page.</p>
    </FocusMoment>
  </FocusShell>;
}
