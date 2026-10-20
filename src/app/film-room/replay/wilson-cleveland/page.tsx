import FocusShell from "@/components/FocusShell";
import WilsonReplay from "@/components/WilsonReplay";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "@/app/focus-fonts";

export const metadata = pageMetadata({
  path: "/film-room/replay/wilson-cleveland", title: "Wilson’s winning touchdown — 3D Film Room",
  description: "Explore Garrett Wilson’s winning 2022 Cleveland touchdown with movable 3D cameras, slow motion and rewind. Recorded facts, observed replay frames, reported accounts and inferred movement are labeled separately.",
});

export default function WilsonReplayPage() {
  return <FocusShell page="wilson-replay" section="/film-room" name="Wilson in Cleveland" checkedAt={null} className={focusFonts}
    entries={[{ id: "replay", title: "3D replay", answer: "Follow the slant" }, { id: "evidence", title: "The evidence", answer: "Facts, film & inference" }]}>
    <WilsonReplay />
  </FocusShell>;
}
