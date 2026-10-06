import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--focus-display", axes: ["opsz"] });
const text = Instrument_Sans({ subsets: ["latin"], variable: "--focus-text" });

/** Font variables for the focus pages; only pages that use them load these faces. */
export const focusFonts = `${display.variable} ${text.variable}`;
