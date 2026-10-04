export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
export type WorkMode = 'ON_SITE' | 'HYBRID' | 'REMOTE';

/** A role as a stranger sees it. No threshold, no screening description. */
export interface OpenRole {
  code: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  salaryRange: string | null;
  intro: string | null;
  skills: string[];
  minYearsExperience: number;
  openedAt?: string | null;
}

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

export const MODE_LABEL: Record<WorkMode, string> = {
  ON_SITE: 'On-site',
  HYBRID: 'Hybrid',
  REMOTE: 'Remote',
};

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * Half-year steps up to three years, then whole years.
 *
 * Somebody six months into their first job should not have to choose
 * between nought and one — both are wrong, and one of them reads as a lie
 * on a form they are being judged by. Precision stops mattering later: the
 * difference between eleven and twelve years is not what anybody is
 * deciding on.
 */
export const EXPERIENCE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'No experience yet' },
  { value: 0.5, label: '6 months' },
  { value: 1, label: '1 year' },
  { value: 1.5, label: '1 year 6 months' },
  { value: 2, label: '2 years' },
  { value: 2.5, label: '2 years 6 months' },
  { value: 3, label: '3 years' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: i + 4,
    label: `${i + 4} years`,
  })),
  { value: 16, label: '16+ years' },
];
