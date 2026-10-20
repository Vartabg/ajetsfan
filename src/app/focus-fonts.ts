import { Lexend } from "next/font/google";

/** Lexend, chosen for readability (it was drawn to reduce visual stress for readers, including dyslexic readers). */
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend" });

/** The site's one face. The root layout sets it on every page; pages still pass it to FocusShell. */
export const focusFonts = lexend.variable;
