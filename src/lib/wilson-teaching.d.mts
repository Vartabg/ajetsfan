export type TeachingBasis = "recorded" | "reported" | "inferred" | "unknown";
export type TeachingPlayer = {
  readonly id: string;
  readonly code: string;
  readonly position: string;
  readonly unit: "offense" | "defense";
  readonly group: string;
  readonly title: string;
  readonly roleBasis: "recorded" | "inferred";
  readonly lesson: string;
  readonly teachingJob: string;
  readonly sourceAction: string | null;
  readonly reportedIntent: string | null;
  readonly reportedConcept: string | null;
  readonly result: string | null;
  readonly assessment: {
    readonly label: string;
    readonly detail: string;
    readonly basis: TeachingBasis;
    readonly evidenceIds: readonly string[];
  };
  readonly evidenceIds: readonly string[];
};
export type TeachingRelationship = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: "protection" | "coverage" | "pass";
  readonly label: string;
  readonly basis: "inferred";
  readonly evidenceIds: readonly string[];
};
export const TEACHING: {
  readonly schemaVersion: 1;
  readonly canonicalPlayId: string;
  readonly players: readonly TeachingPlayer[];
  readonly relationships: readonly TeachingRelationship[];
  readonly legend: {
    readonly roles: string;
    readonly relationships: string;
    readonly assessments: string;
    readonly sourceActions: string;
  };
};
