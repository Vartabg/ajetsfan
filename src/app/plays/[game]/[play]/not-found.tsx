import Link from "next/link";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";

export default function PlayNotFound() {
  return <FocusShell page="missing-play" section="/game-day" name="Play by play" checkedAt={null}
    entries={[{ id: "missing", title: "Play unavailable", answer: "Choose a game" }]}>
    <FocusMoment first id="missing" label="Play by play" heading="This play is unavailable.">
      <p className={shared.caption}>We couldn’t verify a recorded play at this address.</p>
      <Link className={shared.go} href="/game-day/follow">Choose a game or TV clock</Link>
    </FocusMoment>
  </FocusShell>;
}
