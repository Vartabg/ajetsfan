import Link from "next/link";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import { focusFonts } from "./focus-fonts";
import shared from "@/components/Focus.module.css";

export default function NotFound() {
  return <FocusShell page="not-found" entries={[{ id: "missing", title: "Page unavailable", answer: "Find another game" }]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="missing" first label="404 · Missed assignment" heading={<>Blown <em>coverage.</em></>}
      actions={<><Link className={shared.go} href="/">Back to the front page →</Link><Link className={shared.go} href="/morgue">Open the game archive →</Link></>}>
      <p className={shared.caption}>The page you’re looking for isn’t here. The football is.</p>
    </FocusMoment>
  </FocusShell>;
}
