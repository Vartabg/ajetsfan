import { notFound } from "next/navigation";
import { legendBySlug } from "@/lib/legends";
import { ShareImage } from "@/lib/share-image";

export const alt = "A Jets legend’s story from ajetsfan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const person = legendBySlug((await params).slug);
  if (!person) notFound();
  return ShareImage({ eyebrow: `${person.role} · Jets ${person.jetsYears}`, title: person.name, detail: person.tagline });
}
