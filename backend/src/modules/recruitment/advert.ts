/**
 * Turning a posting into the advert that gets published.
 *
 * Written once, from the posting's own fields. The alternative — HR types
 * the advert on a job board and the requirements into the system — is two
 * sources for the same job, and they drift: the advert says React and the
 * scorer is still screening for Vue, so good candidates are rejected for
 * missing a skill nobody asked them for.
 *
 * `description` is deliberately NOT in the advert. It is the requirements
 * spec a CV is scored against, written for precision; an advert is written
 * to be read. `advertIntro` is the part for people.
 */

export interface AdvertSource {
  code: string;
  title: string;
  advertIntro: string | null;
  requiredSkills: string[];
  minYearsExperience: number;
  location: string | null;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
  workMode: 'ON_SITE' | 'HYBRID' | 'REMOTE';
  salaryRange: string | null;
}

export interface AdvertContext {
  companyName: string;
  /** Where CVs are sent. The whole pipeline starts here. */
  applyEmail: string;
  /**
   * The careers page for this role, when there is one.
   *
   * Preferred over the mailbox in the advert: a form knows which job it
   * belongs to, and collects the name, experience and salary that an
   * emailed PDF makes us guess at.
   */
  applyUrl?: string;
}

const EMPLOYMENT: Record<AdvertSource['employmentType'], string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

const MODE: Record<AdvertSource['workMode'], string> = {
  ON_SITE: 'On-site',
  HYBRID: 'Hybrid',
  REMOTE: 'Remote',
};

/**
 * Most feeds truncate a post at roughly this and hide the rest behind a
 * "see more". Everything that matters goes above it.
 */
export const FOLD_CHARS = 210;

export function buildAdvert(job: AdvertSource, ctx: AdvertContext): string {
  const lines: string[] = [];

  // Above the fold: the role, the company, and where. Everything a reader
  // decides on before clicking "see more".
  lines.push(`🚀 HIRING — ${job.title.toUpperCase()}`);
  lines.push('');
  lines.push(`Company: ${ctx.companyName}`);
  if (job.location) {
    lines.push(`📍 ${job.location} · ${MODE[job.workMode]} · ${EMPLOYMENT[job.employmentType]}`);
  } else {
    lines.push(`${MODE[job.workMode]} · ${EMPLOYMENT[job.employmentType]}`);
  }
  lines.push('');

  if (job.advertIntro) {
    lines.push(job.advertIntro.trim());
    lines.push('');
  }

  lines.push('💻 Requirements');
  if (job.minYearsExperience > 0) {
    lines.push(`• ${job.minYearsExperience}+ years of relevant experience`);
  }
  for (const skill of job.requiredSkills) lines.push(`• ${skill}`);
  lines.push('');

  if (job.salaryRange) {
    lines.push(`💰 ${job.salaryRange}`);
    lines.push('');
  }

  // The two strings the pipeline depends on. The code is how an emailed CV
  // finds this posting without anybody filing it by hand.
  lines.push('📧 How to apply');
  if (ctx.applyUrl) {
    lines.push(`Apply here: ${ctx.applyUrl}`);
    lines.push(`Or email your CV to ${ctx.applyEmail} with ${job.code} in the subject line.`);
  } else {
    lines.push(`Email your CV to ${ctx.applyEmail} with ${job.code} in the subject line.`);
  }
  lines.push('');
  lines.push(
    'Every application is read and answered. Shortlisted candidates get a ' +
      'link to pick their own interview time.',
  );
  lines.push('');
  lines.push(hashtags(job, ctx));

  return lines.join('\n');
}

/**
 * Hashtags from the role itself.
 *
 * Skills become tags with the punctuation stripped — "React.js" is not a
 * hashtag, "reactjs" is. Capped at six: past that it reads as spam to a
 * feed algorithm and to a human.
 */
function hashtags(job: AdvertSource, ctx: AdvertContext): string {
  const fromSkills = job.requiredSkills
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((s) => s.length > 1 && s.length < 20);

  const tags = ['hiring', ...fromSkills, slug(ctx.companyName)]
    .filter((t, i, all) => t && all.indexOf(t) === i)
    .slice(0, 7);

  return tags.map((t) => `#${t}`).join(' ');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** What shows before the fold, so HR can judge the opening lines. */
export function abovePreviewFold(advert: string): string {
  return advert.length <= FOLD_CHARS ? advert : `${advert.slice(0, FOLD_CHARS)}…`;
}
