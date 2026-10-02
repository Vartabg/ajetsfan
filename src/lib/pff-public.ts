/** Small, attributed excerpts from publicly visible PFF pages; not a grades feed. */
export type PublicPffGrade = {
  id: string; year: number; subject: string; metric: string; grade: number;
  rank: number; population: number | null; populationLabel: string;
  scope: string; source: string; sourceDate: string; checkedAt: string; note: string;
};
const checkedAt = '2026-10-02T21:23:12.000Z';
const geno = 'https://www.pff.com/nfl/players/geno-smith/7820';
const recap = 'https://www.pff.com/news/nfl-2026-nfl-free-agency-preview-afc-east';
export const publicPffGrades: PublicPffGrade[] = [
  { id: 'geno-overall-2026', year: 2026, subject: 'Geno Smith', metric: 'Overall grade', grade: 74.7, rank: 15, population: 36, populationLabel: 'qualified quarterbacks', scope: '2026 regular season · in progress', source: geno, sourceDate: '2026-10-02', checkedAt, note: 'PFF reports 119 dropbacks. Its page uses a 25% position-volume qualification rule.' },
  { id: 'geno-passing-2026', year: 2026, subject: 'Geno Smith', metric: 'Passing grade', grade: 78.3, rank: 10, population: 36, populationLabel: 'qualified quarterbacks', scope: '2026 regular season · in progress', source: geno, sourceDate: '2026-10-02', checkedAt, note: 'Published PFF assessment of passing performance; distinct from NFL yardage and touchdown ranks.' },
  { id: 'jets-offense-2025', year: 2025, subject: 'Jets offense', metric: 'Offensive grade', grade: 62.6, rank: 31, population: null, populationLabel: 'NFL offenses', scope: '2025 season summary', source: recap, sourceDate: '2026-03-05', checkedAt, note: 'A retrospective grade and rank reported in PFF’s AFC East free-agency preview.' },
  { id: 'jets-defense-2025', year: 2025, subject: 'Jets defense', metric: 'Defensive grade', grade: 56.8, rank: 26, population: null, populationLabel: 'NFL defenses', scope: '2025 season summary', source: recap, sourceDate: '2026-03-05', checkedAt, note: 'The article reports the rank; this edition does not reconstruct PFF’s comparison pool.' },
  { id: 'hall-rushing-2025', year: 2025, subject: 'Breece Hall', metric: 'Rushing grade', grade: 83.7, rank: 8, population: null, populationLabel: 'qualifying rushers', scope: '2025 season summary', source: recap, sourceDate: '2026-03-05', checkedAt, note: 'PFF does not give the qualifier count in this article, so no denominator is inferred.' },
];
