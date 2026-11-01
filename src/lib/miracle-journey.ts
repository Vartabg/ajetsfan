export const JOURNEY_PATH = "/stories/monday-night-miracle";
export const MIAMI_GAME = "2000_08_MIA_NYJ";
export const CLEVELAND_GAME = "2022_02_NYJ_CLE";
export const JOURNEY_STEPS = [
  { id: "story", title: "Relive the comeback", short: "The comeback" },
  { id: "film", title: "Explore Elliott’s catch", short: "Elliott’s catch" },
  { id: "compare", title: "Compare with Cleveland", short: "Two comebacks" },
] as const;
export type JourneyStep = typeof JOURNEY_STEPS[number]["id"];
export type JourneyPosition = { step: JourneyStep; moment: number; progress: number };

export function journeyStep(value: unknown): JourneyStep {
  return JOURNEY_STEPS.some((step) => step.id === value) ? value as JourneyStep : "story";
}

function bounded(value: string | null, min: number, max: number) {
  const number = value === null || value.trim() === "" ? min : Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : min;
}

/** Only selected football state enters a saved/shared URL. No arbitrary destinations. */
export function journeyPosition(search: string, maxMoment = 10000): JourneyPosition {
  const params = new URLSearchParams(search);
  const step = journeyStep(params.getAll("step").length > 1 ? null : params.get("step"));
  const rawMoment = params.get("moment");
  const requestedStory = params.get("story");
  const moment = rawMoment && /^[1-9]\d*$/.test(rawMoment) ? Number(rawMoment) : Number.NaN;
  // Match VisualGameStory: malformed/out-of-range moments or another story's
  // selection fall back to Miami's opening chapter, rather than the last play.
  const validMoment = (!requestedStory || requestedStory === MIAMI_GAME) && Number.isSafeInteger(moment) && moment <= maxMoment;
  return { step, moment: step === "story" && validMoment ? moment : 1,
    progress: step === "compare" ? bounded(params.get("progress"), 0, 100) : 0 };
}

export function journeyHref(position: JourneyPosition): string {
  const step = journeyStep(position.step);
  const params = new URLSearchParams({ step });
  if (step === "story") { params.set("story", MIAMI_GAME); params.set("moment", String(position.moment)); }
  if (step === "compare") params.set("progress", String(position.progress));
  return `${JOURNEY_PATH}?${params}#journey-stage`;
}
