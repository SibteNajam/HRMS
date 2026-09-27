/**
 * The facts HR needs in front of them to decide a leave request.
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
 */

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
    percentage: number;
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
  };
  flags: DecisionFlag[];
}

export function buildFlags(ctx: Omit<DecisionContext, 'flags'>, reason: string): DecisionFlag[] {
  const flags: DecisionFlag[] = [];
  const a = ctx.attendance;

  if (a.workingDays > 0 && a.percentage < THRESHOLDS.LOW_ATTENDANCE_PCT) {
    flags.push({
      code: 'LOW_ATTENDANCE',
      level: 'danger',
      label: `Attendance ${a.percentage.toFixed(0)}%`,
      detail:
        `Below the ${THRESHOLDS.LOW_ATTENDANCE_PCT}% standard over the last ` +
        `${a.windowDays} days — ${a.absentDays} absence${a.absentDays === 1 ? '' : 's'}.`,
    });
  }

  if (
    a.previousPercentage !== null &&
    a.previousPercentage - a.percentage > THRESHOLDS.DECLINE_POINTS
  ) {
    flags.push({
      code: 'DECLINING_ATTENDANCE',
      level: 'warning',
      label: 'Attendance declining',
      detail:
        `Down from ${a.previousPercentage.toFixed(0)}% to ` +
        `${a.percentage.toFixed(0)}% compared with the previous period.`,
    });
  }

  if (a.lateCount >= THRESHOLDS.REPEATED_LATE) {
    flags.push({
      code: 'REPEATED_LATENESS',
      level: 'warning',
      label: `${a.lateCount} late arrivals`,
      detail: `Recorded in the last ${a.windowDays} days.`,
    });
  }

  if (ctx.balance.afterApproval < 0) {
    flags.push({
      code: 'INSUFFICIENT_BALANCE',
      level: 'danger',
      label: 'Exceeds balance',
      detail:
        `Approving this would take the balance to ${ctx.balance.afterApproval} days. ` +
        `The system will refuse the approval.`,
    });
  } else if (ctx.balance.afterApproval === 0 && ctx.balance.allocated > 0) {
    flags.push({
      code: 'BALANCE_EXHAUSTED',
      level: 'info',
      label: 'Uses remaining balance',
      detail: 'This request would use their entire remaining entitlement.',
    });
  }

  if (
    ctx.coverage.departmentSize > 1 &&
    ctx.coverage.othersOffInRange / ctx.coverage.departmentSize >=
      THRESHOLDS.TEAM_COVERAGE_RATIO
  ) {
    flags.push({
      code: 'TEAM_COVERAGE',
      level: 'warning',
      label: 'Team coverage',
      detail:
        `${ctx.coverage.othersOffInRange} of ${ctx.coverage.departmentSize} in ` +
        `this department are already off during these dates` +
        (ctx.coverage.othersOffNames.length
          ? ` — ${ctx.coverage.othersOffNames.join(', ')}.`
          : '.'),
    });
  }

  if (reason.trim().length < THRESHOLDS.THIN_REASON_CHARS) {
    flags.push({
      code: 'THIN_REASON',
      level: 'info',
      label: 'Brief reason',
      detail: 'Consider asking for more detail before deciding.',
    });
  }

  if (ctx.history.tenureMonths < 3) {
    flags.push({
      code: 'NEW_JOINER',
      level: 'info',
      label: `Joined ${ctx.history.tenureMonths} month${ctx.history.tenureMonths === 1 ? '' : 's'} ago`,
      detail: 'Still within the first quarter of employment.',
    });
  }

  if (ctx.history.rejectedThisYear > 0) {
    flags.push({
      code: 'PRIOR_REJECTIONS',
      level: 'info',
      label: `${ctx.history.rejectedThisYear} rejected this year`,
      detail: 'Previous requests were declined — worth a look at why.',
    });
  }

  // Nothing wrong is itself worth stating: a queue of cards with no badges
  // looks like the check did not run.
  if (flags.length === 0) {
    flags.push({
      code: 'CLEAR',
      level: 'info',
      label: 'No concerns',
      detail: 'Balance, attendance and team coverage all look normal.',
    });
  }

  return flags;
}
