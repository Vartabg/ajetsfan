import catalog from "./media-catalog.json";
import { validateMediaCollection, type MediaCollection } from "./media";

/** Curated, dated links; source checks are not live social-feed access. */
export const mediaCollection = validateMediaCollection(catalog as MediaCollection);
