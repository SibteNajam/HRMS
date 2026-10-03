/**
 * The facts HR needs in front of them to decide a leave request, and the
 * rules that read them.
 *
 * Every factor here is named in the source documents:
 *   - leave balance and policy verification   (report §5, §7.3)
 *   - repeated lateness                       (report §7.2, deck slide 3)
 *   - significant decline in attendance       (report §7.2)
 *   - attendance below 80%                    (report §8)
 *   - missing clarification in the request    (deck slide 3)
 *
 * All of it is computed by rules, not by the model. A flag must be
 * reproducible and explainable — "attendance below 80%" can be defended in a
 * conversation with an employee; "the AI thought so" cannot.
 *
 * ── Adding a factor ──────────────────────────────────────────────────
 * Append one entry to DECISION_RULES. That is the whole change:
 *   - HR sees the new badge on the approval card
 *   - the recommendation prompt describes it, because the prompt is
 *     generated from this array
 *   - a `blocking` or `concern` weight changes the recommended verdict
 *     deterministically, in code, without the model being asked to agree
 * No prompt is edited and no AI code is touched.
 */

import { createHash } from 'node:crypto';

export const THRESHOLDS = {
  /** Report §8 names 80% explicitly. */
  LOW_ATTENDANCE_PCT: 80,
  /** Percentage points of decline that counts as "significant". */
  DECLINE_POINTS: 15,
  /** Late arrivals in the window that counts as "repeated". */
  REPEATED_LATE: 3,
  /** Share of a department off at once before coverage is a concern. */
  TEAM_COVERAGE_RATIO: 0.4,
  /** Days of history the attendance figures are drawn from. */
  WINDOW_DAYS: 90,
  /** A reason shorter than this is likely missing detail. */
  THIN_REASON_CHARS: 25,
  /** Months of service below which someone is still a new joiner. */
  NEW_JOINER_MONTHS: 3,
} as const;

export type FlagLevel = 'info' | 'warning' | 'danger';

export interface DecisionFlag {
  code: string;
  level: FlagLevel;
  label: string;
  detail: string;
}

export interface DecisionContext {
  attendance: {
    windowDays: number;
    /** null when there are no attendance records yet — a new joiner has no
     *  attendance rate, which is different from a rate of 0%. */
    percentage: number | null;
    previousPercentage: number | null;
    presentDays: number;
    lateCount: number;
    absentDays: number;
    onLeaveDays: number;
    workingDays: number;
  };
  balance: {
    allocated: number;
    used: number;
    remaining: number;
    afterApproval: number;
  };
  history: {
    daysTakenThisYear: number;
    requestsThisYear: number;
    rejectedThisYear: number;
    tenureMonths: number;
  };
  coverage: {
    departmentSize: number;
    othersOffInRange: number;
    othersOffNames: string[];
    /** The job title being covered — "Backend Engineer", "Account Executive". */
    designation: string;
    /** How many active people in this department hold the same job title. */
    sameRoleSize: number;
    /** How many of those are already approved off across these dates. */
    sameRoleOff: number;
    /** Their names and dates, so the reviewer can see the clash itself. */
    sameRoleOffNames: string[];
  };
  flags: DecisionFlag[];
}

export type Facts = Omit<DecisionContext, 'flags'>;

export interface RuleInput {
  ctx: Facts;
  reason: string;
}

/**
 * How much a flag should weigh on the recommended verdict.
 *
 *   blocking — approving is impossible; the approve endpoint would refuse it
 *   concern  — a person must look at this before deciding
 *   note     — worth knowing, not worth stopping for
 *
 * This is what makes the recommendation deterministic where it matters. The
 * model writes the explanation; the weight decides the floor.
 */
export type RuleWeight = 'blocking' | 'concern' | 'note';

export interface DecisionRule {
  code: string;
  level: FlagLevel;
  weight: RuleWeight;
  /** One line, shown to HR and given to the model, explaining what the flag means. */
  meaning: string;
  applies(input: RuleInput): boolean;
  describe(input: RuleInput): { label: string; detail: string };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const DECISION_RULES: DecisionRule[] = [
  {
    code: 'INSUFFICIENT_BALANCE',
    level: 'danger',
    weight: 'blocking',
    meaning:
      'The request is longer than the balance left. The system refuses this ' +
      'approval, so it cannot be granted as it stands.',
    applies: ({ ctx }) => ctx.balance.afterApproval < 0,
    describe: ({ ctx }) => ({
      label: 'Exceeds balance',
      detail:
        `Approving this would take the balance to ${ctx.balance.afterApproval} days. ` +
        `The system will refuse the approval.`,
    }),
  },
  {
    code: 'LOW_ATTENDANCE',
    level: 'danger',
    weight: 'concern',
    meaning:
      `Attendance is below the ${THRESHOLDS.LOW_ATTENDANCE_PCT}% standard the ` +
      `company works to. Not a reason to refuse by itself, but a person should look.`,
    applies: ({ ctx }) =>
      ctx.attendance.percentage !== null &&
      ctx.attendance.percentage < THRESHOLDS.LOW_ATTENDANCE_PCT,
    describe: ({ ctx }) => ({
      label: `Attendance ${ctx.attendance.percentage!.toFixed(0)}%`,
      detail:
        `Below the ${THRESHOLDS.LOW_ATTENDANCE_PCT}% standard over the last ` +
        `${ctx.attendance.windowDays} days — ${plural(ctx.attendance.absentDays, 'absence')}.`,
    }),
  },
  {
    code: 'DECLINING_ATTENDANCE',
    level: 'warning',
    weight: 'concern',
    meaning:
      `Attendance has fallen by more than ${THRESHOLDS.DECLINE_POINTS} points ` +
      `against the previous period — a trend worth raising before more leave is granted.`,
    applies: ({ ctx }) =>
      ctx.attendance.percentage !== null &&
      ctx.attendance.previousPercentage !== null &&
      ctx.attendance.previousPercentage - ctx.attendance.percentage >
        THRESHOLDS.DECLINE_POINTS,
    describe: ({ ctx }) => ({
      label: 'Attendance declining',
      detail:
        `Down from ${ctx.attendance.previousPercentage!.toFixed(0)}% to ` +
        `${ctx.attendance.percentage!.toFixed(0)}% compared with the previous period.`,
    }),
  },
  {
    code: 'TEAM_COVERAGE',
    level: 'warning',
    weight: 'concern',
    meaning:
      'Enough of the department is already off during these dates that cover ' +
      'is in question. Only the manager knows whether that is workable.',
    applies: ({ ctx }) =>
      ctx.coverage.departmentSize > 1 &&
      ctx.coverage.othersOffInRange / ctx.coverage.departmentSize >=
        THRESHOLDS.TEAM_COVERAGE_RATIO,
    describe: ({ ctx }) => ({
      label: 'Team coverage',
      detail:
        `${ctx.coverage.othersOffInRange} of ${ctx.coverage.departmentSize} in ` +
        `this department are already off during these dates` +
        (ctx.coverage.othersOffNames.length
          ? ` — ${ctx.coverage.othersOffNames.join(', ')}.`
          : '.'),
    }),
  },
  {
    code: 'ROLE_UNCOVERED',
    level: 'warning',
    weight: 'concern',
    meaning:
      'Everyone else who does this job is already off across these dates. ' +
      'The department may look well covered and still have nobody able to ' +
      'do this particular work. Name who is off and when.',
    // A department ratio misses this entirely: two backend engineers in a
    // team of twelve is 17% of the department and 100% of the capability.
    applies: ({ ctx }) =>
      ctx.coverage.sameRoleSize > 1 &&
      ctx.coverage.sameRoleOff > 0 &&
      ctx.coverage.sameRoleOff >= ctx.coverage.sameRoleSize - 1,
    describe: ({ ctx }) => {
      const others = ctx.coverage.sameRoleSize - 1;
      const who = ctx.coverage.sameRoleOffNames.join(', ');
      return {
        label: `No other ${ctx.coverage.designation} available`,
        detail:
          (others === 1
            ? `${who} is the only other ${ctx.coverage.designation}, and is already off across these dates.`
            : `${ctx.coverage.sameRoleOff} of the other ${others} ` +
              `${ctx.coverage.designation}s are already off across these dates — ${who}.`) +
          ` Approving this would leave the role uncovered.`,
      };
    },
  },
  {
    code: 'REPEATED_LATENESS',
    level: 'warning',
    weight: 'note',
    meaning:
      'Repeated late arrivals in the window. Context for the conversation, ' +
      'not grounds to refuse leave.',
    applies: ({ ctx }) => ctx.attendance.lateCount >= THRESHOLDS.REPEATED_LATE,
    describe: ({ ctx }) => ({
      label: `${ctx.attendance.lateCount} late arrivals`,
      detail: `Recorded in the last ${ctx.attendance.windowDays} days.`,
    }),
  },
  {
    code: 'BALANCE_EXHAUSTED',
    level: 'info',
    weight: 'note',
    meaning: 'The request uses the entire remaining entitlement, leaving nothing for the rest of the year.',
    applies: ({ ctx }) =>
      ctx.balance.afterApproval === 0 && ctx.balance.allocated > 0,
    describe: () => ({
      label: 'Uses remaining balance',
      detail: 'This request would use their entire remaining entitlement.',
    }),
  },
  {
    code: 'THIN_REASON',
    level: 'info',
    weight: 'note',
    meaning: 'The stated reason is too short to judge. Worth asking for detail.',
    applies: ({ reason }) => reason.trim().length < THRESHOLDS.THIN_REASON_CHARS,
    describe: () => ({
      label: 'Brief reason',
      detail: 'Consider asking for more detail before deciding.',
    }),
  },
  {
    code: 'NO_ATTENDANCE_DATA',
    level: 'info',
    weight: 'note',
    meaning:
      'There is no attendance history at all. This is not poor attendance — ' +
      'there is simply nothing to judge against.',
    applies: ({ ctx }) => ctx.attendance.percentage === null,
    describe: () => ({
      label: 'No attendance history',
      detail:
        'There are no attendance records for this person yet, so there is ' +
        'no rate to judge against.',
    }),
  },
  {
    code: 'NEW_JOINER',
    level: 'info',
    weight: 'note',
    meaning: 'Still in their first months, so there is little history behind the request.',
    applies: ({ ctx }) => ctx.history.tenureMonths < THRESHOLDS.NEW_JOINER_MONTHS,
    describe: ({ ctx }) => ({
      label: `Joined ${plural(ctx.history.tenureMonths, 'month')} ago`,
      detail: 'Still within the first quarter of employment.',
    }),
  },
  {
    code: 'PRIOR_REJECTIONS',
    level: 'info',
    weight: 'note',
    meaning: 'Earlier requests this year were declined. The reason may still apply.',
    applies: ({ ctx }) => ctx.history.rejectedThisYear > 0,
    describe: ({ ctx }) => ({
      label: `${ctx.history.rejectedThisYear} rejected this year`,
      detail: 'Previous requests were declined — worth a look at why.',
    }),
  },
];

/** Raised when no rule fires. A card with no badges looks like the check did not run. */
export const CLEAR_FLAG: DecisionFlag = {
  code: 'CLEAR',
  level: 'info',
  label: 'No concerns',
  detail: 'Balance, attendance and team coverage all look normal.',
};

export interface RuleHit {
  rule: DecisionRule;
  flag: DecisionFlag;
}

/** Every rule that fired, with the flag it produced. */
export function evaluateRules(ctx: Facts, reason: string): RuleHit[] {
  const input: RuleInput = { ctx, reason };
  return DECISION_RULES.filter((rule) => rule.applies(input)).map((rule) => ({
    rule,
    flag: { code: rule.code, level: rule.level, ...rule.describe(input) },
  }));
}

export function buildFlags(ctx: Facts, reason: string): DecisionFlag[] {
  const flags = evaluateRules(ctx, reason).map((hit) => hit.flag);
  return flags.length > 0 ? flags : [CLEAR_FLAG];
}

/**
 * The strongest verdict the facts alone justify, decided in code.
 *
 *   blocking present → REJECT. Approval is impossible, so there is nothing
 *                      to weigh.
 *   concern present  → REVIEW. A person must look at it.
 *   otherwise        → APPROVE.
 *
 * The model's opinion is never allowed below this floor. Add a rule with a
 * `concern` weight tomorrow and the recommendation changes tomorrow, with no
 * prompt edit and no trust placed in the model having noticed.
 */
export function verdictFloor(hits: RuleHit[]): 'APPROVE' | 'REVIEW' | 'REJECT' {
  if (hits.some((h) => h.rule.weight === 'blocking')) return 'REJECT';
  if (hits.some((h) => h.rule.weight === 'concern')) return 'REVIEW';
  return 'APPROVE';
}

/**
 * The rule book in prompt form, generated rather than written.
 *
 * This is the line that makes a new factor reach the model automatically: a
 * rule appended to DECISION_RULES appears here on the next request.
 */
export function describeRules(): string {
  const byWeight = (weight: RuleWeight) =>
    DECISION_RULES.filter((r) => r.weight === weight)
      .map((r) => `- ${r.code}: ${r.meaning}`)
      .join('\n');

  return `The system has already checked every request against these rules and
returned the ones that fired as "rulesEngineFlags". You do not re-check them
and you do not compute anything — you explain what they mean for this case.

BLOCKING — approval is impossible while this holds:
${byWeight('blocking') || '- (none)'}

CONCERNS — a person must weigh these before deciding:
${byWeight('concern') || '- (none)'}

NOTES — context, not grounds to refuse:
${byWeight('note') || '- (none)'}`;
}

/** The same floor, for a caller that already holds the flags but not the facts. */
export function floorFromFlags(flags: DecisionFlag[]): 'APPROVE' | 'REVIEW' | 'REJECT' {
  const byCode = new Map(DECISION_RULES.map((r) => [r.code, r]));
  const weights = flags.map((f) => byCode.get(f.code)?.weight);
  if (weights.includes('blocking')) return 'REJECT';
  if (weights.includes('concern')) return 'REVIEW';
  return 'APPROVE';
}


/**
 * A fingerprint of the facts a recommendation was given on.
 *
 * Stored advice saves an API call, but only while it is still about the
 * same situation. When a colleague's leave is approved, an absence is
 * recorded, or the balance moves, this stops matching and the advice is
 * marked stale rather than standing quietly on figures that have changed.
 *
 * Only values a rule actually reads go in. A field nothing depends on must
 * not invalidate advice that is still correct.
 */
export function contextFingerprint(ctx: Facts, reason: string): string {
  const material = [
    ctx.attendance.percentage,
    ctx.attendance.previousPercentage,
    ctx.attendance.lateCount,
    ctx.attendance.absentDays,
    ctx.attendance.workingDays,
    ctx.balance.allocated,
    ctx.balance.used,
    ctx.balance.remaining,
    ctx.balance.afterApproval,
    ctx.history.daysTakenThisYear,
    ctx.history.requestsThisYear,
    ctx.history.rejectedThisYear,
    ctx.history.tenureMonths,
    ctx.coverage.departmentSize,
    ctx.coverage.othersOffInRange,
    ctx.coverage.designation,
    ctx.coverage.sameRoleSize,
    ctx.coverage.sameRoleOff,
    reason.trim(),
  ];
  return createHash('sha1').update(JSON.stringify(material)).digest('hex');
}
