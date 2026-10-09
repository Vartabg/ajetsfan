import catalog from "../../public/data/media.json";
import { validateMediaCollection, type MediaCollection } from "./media";

/** A validated edition of publisher feeds plus the dated editorial archive. */
export const mediaCollection = validateMediaCollection(catalog as MediaCollection);
