/**
 * Salary calculation, as pure functions.
 *
 * This is the one place in the system where a mistake costs someone money.
 * Nothing here touches the database, the clock or the AI — it takes numbers
 * and returns numbers, so every rule can be tested in isolation.
 */

export interface PayrollInput {
  baseSalary: number;
  allowances: number;
  /** From attendance. Never entered by hand. */
  overtimeMinutes: number;
  /** From approved leave of an unpaid type. */
  unpaidLeaveDays: number;
  /** Working days in the month, excluding weekends and holidays. */
  workingDaysInMonth: number;
  /** Days the employee was actually on payroll, for a mid-month joiner. */
  payableDays?: number;
  standardWorkHours: number;
  overtimeRateMultiplier: number;
  /** Requested dues recovery. Capped so net pay cannot go negative. */
  duesInstallment: number;
  bonus: number;
  otherDeductions: number;
}

export interface PayrollResult {
  baseSalary: number;
  allowances: number;
  overtimeAmount: number;
  bonus: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  duesDeduction: number;
  gross: number;
  totalDeductions: number;
  netSalary: number;
  /** Recovery we could not take this month because net would go negative. */
  duesShortfall: number;
  /** Shown on the payslip so the figures can be checked by hand. */
  workings: {
    perDayRate: number;
    hourlyRate: number;
    overtimeHours: number;
    proRataFactor: number;
  };
}

/**
 * Round to 2 decimals once per component, never mid-formula.
 *
 * Money is held as DECIMAL(12,2) in the database. JavaScript numbers are
 * binary floats — 0.1 + 0.2 is not 0.3 — so every component is rounded as it
 * is produced rather than letting error accumulate into the total.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateNetSalary(input: PayrollInput): PayrollResult {
  const {
    baseSalary, allowances, overtimeMinutes, unpaidLeaveDays,
    workingDaysInMonth, payableDays, standardWorkHours,
    overtimeRateMultiplier, duesInstallment, bonus, otherDeductions,
  } = input;

  // A month with no working days would divide by zero. It cannot happen with
  // a real calendar, but a misconfigured weekend could produce it.
  const safeWorkingDays = workingDaysInMonth > 0 ? workingDaysInMonth : 1;

  // Someone who joined mid-month is paid for the part of the month they were
  // employed, not the whole thing.
  const proRataFactor =
    payableDays === undefined || payableDays >= safeWorkingDays
      ? 1
      : Math.max(0, payableDays) / safeWorkingDays;

  const earnedBase = round2(baseSalary * proRataFactor);
  const earnedAllowances = round2(allowances * proRataFactor);

  const perDayRate = round2(baseSalary / safeWorkingDays);
  const hourlyRate = round2(perDayRate / standardWorkHours);

  const overtimeHours = round2(overtimeMinutes / 60);
  const overtimeAmount = round2(overtimeHours * hourlyRate * overtimeRateMultiplier);

  const unpaidLeaveDeduction = round2(unpaidLeaveDays * perDayRate);

  const gross = round2(earnedBase + earnedAllowances + overtimeAmount + bonus);

  // Dues are recovered only from what is left after the statutory pieces.
  // Taking someone's pay below zero is not a recovery, it is a debt.
  const beforeDues = round2(gross - unpaidLeaveDeduction - otherDeductions);
  const recoverable = Math.max(0, beforeDues);
  const duesDeduction = round2(Math.min(duesInstallment, recoverable));
  const duesShortfall = round2(Math.max(0, duesInstallment - duesDeduction));

  const totalDeductions = round2(
    unpaidLeaveDeduction + otherDeductions + duesDeduction,
  );
  const netSalary = round2(Math.max(0, gross - totalDeductions));

  return {
    baseSalary: earnedBase,
    allowances: earnedAllowances,
    overtimeAmount,
    bonus: round2(bonus),
    unpaidLeaveDeduction,
    otherDeductions: round2(otherDeductions),
    duesDeduction,
    gross,
    totalDeductions,
    netSalary,
    duesShortfall,
    workings: { perDayRate, hourlyRate, overtimeHours, proRataFactor },
  };
}

/** Flags for HR to look at before finalising. Rules, never a model. */
export const PAYROLL_THRESHOLDS = {
  /** Net differs from last month by more than this share. */
  LARGE_CHANGE: 0.2,
  /**
   * Overtime worth more than this share of base pay.
   *
   * Expressed as a ratio rather than hours so it can be checked against a
   * stored payslip, which holds amounts and not the hours behind them.
   */
  EXCESSIVE_OVERTIME_RATIO: 0.25,
  /** Deductions above this share of gross. */
  HIGH_DEDUCTIONS: 0.5,
} as const;

/** The components of a payslip — stored or freshly calculated. */
export interface PayslipFigures {
  baseSalary: number;
  allowances: number;
  overtimeAmount: number;
  bonus: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  duesDeduction: number;
  netSalary: number;
  duesShortfall?: number;
}

export interface PayrollFlag {
  code: string;
  level: 'info' | 'warning' | 'danger';
  label: string;
  detail: string;
}

export function flagPayslip(
  result: PayslipFigures,
  previousNet: number | null,
): PayrollFlag[] {
  const flags: PayrollFlag[] = [];
  const gross = round2(
    result.baseSalary + result.allowances + result.overtimeAmount + result.bonus,
  );
  const totalDeductions = round2(
    result.unpaidLeaveDeduction + result.otherDeductions + result.duesDeduction,
  );

  if (previousNet !== null && previousNet > 0) {
    const change = (result.netSalary - previousNet) / previousNet;
    if (Math.abs(change) > PAYROLL_THRESHOLDS.LARGE_CHANGE) {
      flags.push({
        code: 'LARGE_CHANGE',
        level: 'warning',
        label: `Net ${change > 0 ? 'up' : 'down'} ${Math.abs(change * 100).toFixed(0)}%`,
        detail: `Last month was ${previousNet.toFixed(2)}, this month is ${result.netSalary.toFixed(2)}.`,
      });
    }
  }

  if (
    result.baseSalary > 0 &&
    result.overtimeAmount / result.baseSalary > PAYROLL_THRESHOLDS.EXCESSIVE_OVERTIME_RATIO
  ) {
    flags.push({
      code: 'EXCESSIVE_OVERTIME',
      level: 'warning',
      label: `Overtime is ${((result.overtimeAmount / result.baseSalary) * 100).toFixed(0)}% of base pay`,
      detail: 'Well above a normal month — worth checking the attendance records.',
    });
  }

  if (gross > 0 && totalDeductions / gross > PAYROLL_THRESHOLDS.HIGH_DEDUCTIONS) {
    flags.push({
      code: 'HIGH_DEDUCTIONS',
      level: 'danger',
      label: `Deductions are ${((totalDeductions / gross) * 100).toFixed(0)}% of gross`,
      detail: 'Check whether more than one dues installment landed this month.',
    });
  }

  if ((result.duesShortfall ?? 0) > 0) {
    flags.push({
      code: 'DUES_SHORTFALL',
      level: 'info',
      label: `${(result.duesShortfall ?? 0).toFixed(2)} of dues not recovered`,
      detail: 'Net pay would have gone below zero. The balance carries forward.',
    });
  }

  // Distinguish "no salary has been set" from "deductions ate the salary".
  // Both show zero net, but one is a missing setup step and the other is a
  // real payroll event — and only one of them is fixed in Salary Structure.
  if (result.baseSalary === 0 && result.allowances === 0) {
    flags.push({
      code: 'NO_SALARY',
      level: 'danger',
      label: 'No salary set',
      detail:
        'This employee has no base salary. Set it under Payroll → Salary ' +
        'Structure, then delete and recalculate this draft.',
    });
  } else if (result.netSalary === 0) {
    flags.push({
      code: 'ZERO_NET',
      level: 'danger',
      label: 'Net pay is zero',
      detail: 'Deductions consumed the entire salary. Confirm before finalising.',
    });
  }

  return flags;
}


// ─── Explaining the unpaid-leave deduction ──────────────────────────────

/**
 * One stretch of unpaid leave, already clipped to the payroll month.
 *
 * `days` is working days inside the month — not the length of the spell. A
 * week off that straddles month end is deducted across two payslips, each
 * for the part that falls in it, which is the only arithmetic an employee
 * can check against their own calendar.
 */
export interface UnpaidLeaveSpell {
  leaveType: string;
  from: Date;
  to: Date;
  days: number;
}

/**
 * The sentence that appears beside the leave deduction.
 *
 * Built from the approved leave records, not written by a model. The dates
 * and the rate are the two things an employee will check, and a figure that
 * cannot be reproduced from the record is a figure that cannot be defended
 * in the conversation that follows.
 */
export function describeUnpaidLeave(
  spells: UnpaidLeaveSpell[],
  perDayRate: number,
  currency = 'PKR',
): string | null {
  const taken = spells.filter((s) => s.days > 0);
  if (taken.length === 0) return null;

  const totalDays = round2(taken.reduce((sum, s) => sum + s.days, 0));

  // Grouped by type so "Unpaid leave: …" reads once even when somebody took
  // several separate stretches of it.
  const byType = new Map<string, UnpaidLeaveSpell[]>();
  for (const spell of taken) {
    byType.set(spell.leaveType, [...(byType.get(spell.leaveType) ?? []), spell]);
  }

  const detail = [...byType.entries()]
    .map(([type, list]) => `${type}: ${list.map(describeSpan).join(', ')}`)
    .join('; ');

  return (
    `${totalDays} unpaid day${totalDays === 1 ? '' : 's'} at ` +
    `${currency} ${money(perDayRate)} per day. ${detail}.`
  );
}

/** "12–14 Mar", or "20 Mar" when it is a single day. */
function describeSpan(spell: UnpaidLeaveSpell): string {
  const from = day(spell.from);
  const to = day(spell.to);
  if (from === to) return from;

  // "12–14 Mar" rather than "12 Mar–14 Mar" when the month is shared.
  const [fromDay, fromMonth] = from.split(' ');
  const [, toMonth] = to.split(' ');
  return fromMonth === toMonth ? `${fromDay}–${to}` : `${from}–${to}`;
}

function day(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(date);
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}
