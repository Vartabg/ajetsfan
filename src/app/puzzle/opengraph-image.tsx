import { ShareImage } from "@/lib/share-image";

export const alt = "Which Jets game? The Back Page's daily puzzle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "The daily puzzle",
    title: "Which Jets game?",
    detail: "One recorded game a day. Six guesses. Every clue comes from the record: the probability line, the conditions, the margin, the score.",
  });
}
