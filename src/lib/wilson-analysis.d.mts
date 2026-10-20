export type AnalysisBasis = "recorded" | "charted" | "reported" | "observed" | "inferred" | "definition" | "conflicting";
export type StudyActorId = "qb" | "wilson" | "lt" | "lg" | "c" | "rg" | "rt" | "x" | "z" | "y" | "rb" | "d1" | "d2" | "d3" | "d4" | "d5" | "d6" | "d7" | "d8" | "d9" | "d10" | "d11";
export type StudyPhase = "pre" | "develop" | "flight" | "finish";
export type AnalysisSource = Readonly<{ id: string; title: string; url: string | null; attribution: string; locator: string; basis: AnalysisBasis; limit: string; sha256?: string }>;
export type AnalysisChartField = Readonly<{ key: string; label: string; value: string | number | boolean | null; definition: string; sourceIds: readonly string[]; limit: string }>;
export type AnalysisMetric = Readonly<{ key: "epa" | "wp_before" | "wp_after" | "wpa" | "air_yards" | "yac" | "cp" | "cpoe"; label: string; value: number; unit: string; definition: string; sourceIds: readonly string[]; limit: string }>;
export type AnalysisParticipant = Readonly<{ name: string; gsisId: string; team: "NYJ" | "CLE"; position: string; depthPosition: string; number: number; basis: "charted"; sourceIds: readonly string[]; figureId: null }>;
export type AnalysisConclusion = Readonly<{ title: string; text: string; basis: AnalysisBasis; sourceIds: readonly string[]; limit: string }>;
export type StudyCard = Readonly<{ actorId: StudyActorId; phase: StudyPhase; phaseLabel: string; basis: "inferred"; sourceIds: readonly string[]; limit: string; key: string; read: string; technique: string; hypothesis: string; test: string; alternative: string }>;
export type RoleStudy = Readonly<{ actorId: StudyActorId; title: string; basis: "inferred"; sourceIds: readonly string[]; phases: Readonly<Record<StudyPhase, StudyCard>> }>;
export const ANALYSIS: Readonly<{
  schemaVersion: 1;
  canonicalPlayId: "2022_02_NYJ_CLE:4199";
  corpusEdition: string;
  sources: readonly AnalysisSource[];
  charting: Readonly<{
    summary: string;
    fields: readonly AnalysisChartField[];
    raw: Readonly<Record<"pbp" | "participation" | "ftn", Readonly<Record<string, string | number | boolean | null>>>>;
    conflicts: readonly Readonly<{ title: string; text: string; sourceIds: readonly string[] }>[];
  }>;
  metrics: readonly AnalysisMetric[];
  participants: Readonly<{ offense: readonly AnalysisParticipant[]; defense: readonly AnalysisParticipant[] }>;
  conclusions: readonly AnalysisConclusion[];
  roleStudies: Readonly<Record<StudyActorId, RoleStudy>>;
  provenance: Readonly<{
    datasetAttribution: string;
    license: Readonly<{ label: string; url: string; datasetLicenseUrl: string }>;
    derivation: string;
    participationProvider: Readonly<{ label: string; url: string; limit: string }>;
    readCode: Readonly<{ rawField: "read_thrown"; rawValue: "1"; status: string; detail: string; sourceIds: readonly string[] }>;
    sourceHashes: Readonly<Record<string, string>>;
  }>;
  participantLimit: string;
  clockLimit: string;
}>;
export function studyAt(actorId: string, time: number): StudyCard | null;
