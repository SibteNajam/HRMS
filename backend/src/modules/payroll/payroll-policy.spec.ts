import { describe, expect, it } from 'vitest';
import {
  calculateNetSalary, describeUnpaidLeave, endOfPayrollMonth, flagPayslip,
  monthHasEnded, payrollMonthName, payrollOpensOn, round2,
  type PayrollInput,
} from './payroll-policy.js';

const base = (over: Partial<PayrollInput> = {}): PayrollInput => ({
  baseSalary: 44_000,
  allowances: 0,
  overtimeMinutes: 0,
  unpaidLeaveDays: 0,
  workingDaysInMonth: 22,
  standardWorkHours: 8,
  overtimeRateMultiplier: 1.5,
  duesInstallment: 0,
  bonus: 0,
  otherDeductions: 0,
  ...over,
});

describe('the formula', () => {
  it('pays base salary alone when there is nothing else', () => {
    expect(calculateNetSalary(base()).netSalary).toBe(44_000);
  });

  it('adds allowances', () => {
    expect(calculateNetSalary(base({ allowances: 5_000 })).netSalary).toBe(49_000);
  });

  it('adds a bonus', () => {
    expect(calculateNetSalary(base({ bonus: 10_000 })).netSalary).toBe(54_000);
  });

  it('subtracts other deductions', () => {
    expect(calculateNetSalary(base({ otherDeductions: 2_000 })).netSalary).toBe(42_000);
  });

  it('applies every component together', () => {
    // 44000 + 5000 + 3000 bonus = 52000 gross
    // − 2000 unpaid (1 day at 2000) − 1000 other − 4000 dues = 45000
    const r = calculateNetSalary(base({
      allowances: 5_000, bonus: 3_000, unpaidLeaveDays: 1,
      otherDeductions: 1_000, duesInstallment: 4_000,
    }));
    expect(r.gross).toBe(52_000);
    expect(r.unpaidLeaveDeduction).toBe(2_000);
    expect(r.netSalary).toBe(45_000);
  });
});

describe('overtime', () => {
  it('is zero when none was worked', () => {
    expect(calculateNetSalary(base()).overtimeAmount).toBe(0);
  });

  it('pays the configured multiplier', () => {
    // 44000 / 22 days = 2000/day; / 8h = 250/hour; × 1.5 = 375/hour
    const r = calculateNetSalary(base({ overtimeMinutes: 120 }));
    expect(r.workings.hourlyRate).toBe(250);
    expect(r.overtimeAmount).toBe(750);
    expect(r.netSalary).toBe(44_750);
  });

  it('handles part hours', () => {
    const r = calculateNetSalary(base({ overtimeMinutes: 90 }));
    expect(r.workings.overtimeHours).toBe(1.5);
    expect(r.overtimeAmount).toBe(562.5);
  });

  it('respects a different multiplier', () => {
    const r = calculateNetSalary(base({ overtimeMinutes: 60, overtimeRateMultiplier: 2 }));
    expect(r.overtimeAmount).toBe(500);
  });
});

describe('unpaid leave', () => {
  it('deducts a day at the per-day rate', () => {
    const r = calculateNetSalary(base({ unpaidLeaveDays: 3 }));
    expect(r.workings.perDayRate).toBe(2_000);
    expect(r.unpaidLeaveDeduction).toBe(6_000);
    expect(r.netSalary).toBe(38_000);
  });

  it('handles a half day', () => {
    expect(calculateNetSalary(base({ unpaidLeaveDays: 0.5 })).unpaidLeaveDeduction).toBe(1_000);
  });
});

describe('dues recovery', () => {
  it('takes the full installment when pay allows', () => {
    const r = calculateNetSalary(base({ duesInstallment: 4_000 }));
    expect(r.duesDeduction).toBe(4_000);
    expect(r.duesShortfall).toBe(0);
  });

  it('never takes net pay below zero', () => {
    // The whole point: a recovery that would leave someone owing money is
    // not a recovery.
    const r = calculateNetSalary(base({ baseSalary: 10_000, duesInstallment: 15_000 }));
    expect(r.duesDeduction).toBe(10_000);
    expect(r.netSalary).toBe(0);
    expect(r.duesShortfall).toBe(5_000);
  });

  it('recovers only from what is left after other deductions', () => {
    const r = calculateNetSalary(base({
      baseSalary: 10_000, otherDeductions: 8_000, duesInstallment: 5_000,
    }));
    expect(r.duesDeduction).toBe(2_000);
    expect(r.duesShortfall).toBe(3_000);
    expect(r.netSalary).toBe(0);
  });

  it('recovers nothing when deductions already consumed the salary', () => {
    const r = calculateNetSalary(base({
      baseSalary: 10_000, otherDeductions: 12_000, duesInstallment: 3_000,
    }));
    expect(r.duesDeduction).toBe(0);
    expect(r.netSalary).toBe(0);
  });
});

describe('mid-month joiners', () => {
  it('pro-rates base and allowances', () => {
    const r = calculateNetSalary(base({
      allowances: 2_200, workingDaysInMonth: 22, payableDays: 11,
    }));
    expect(r.baseSalary).toBe(22_000);
    expect(r.allowances).toBe(1_100);
    expect(r.netSalary).toBe(23_100);
  });

  it('does not pro-rate someone employed all month', () => {
    const r = calculateNetSalary(base({ workingDaysInMonth: 22, payableDays: 22 }));
    expect(r.baseSalary).toBe(44_000);
  });

  it('never pro-rates above full pay', () => {
    const r = calculateNetSalary(base({ workingDaysInMonth: 22, payableDays: 30 }));
    expect(r.baseSalary).toBe(44_000);
  });
});

describe('rounding and edge cases', () => {
  it('rounds to two decimals without float drift', () => {
    const r = calculateNetSalary(base({ baseSalary: 45_000.1, overtimeMinutes: 180 }));
    expect(Number.isFinite(r.netSalary)).toBe(true);
    expect(r.netSalary).toBe(round2(r.netSalary));
    expect(String(r.netSalary).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('never returns a negative net', () => {
    const r = calculateNetSalary(base({ otherDeductions: 99_999 }));
    expect(r.netSalary).toBe(0);
  });

  it('survives a month with no working days', () => {
    const r = calculateNetSalary(base({ workingDaysInMonth: 0 }));
    expect(Number.isFinite(r.netSalary)).toBe(true);
  });

  it('gross is always earnings, never net', () => {
    const r = calculateNetSalary(base({ allowances: 1_000, otherDeductions: 500 }));
    expect(r.gross).toBe(45_000);
    expect(r.netSalary).toBe(44_500);
  });
});

describe('flags', () => {
  const clean = calculateNetSalary(base());

  it('flags a large change against last month', () => {
    const codes = flagPayslip(clean, 20_000).map((f) => f.code);
    expect(codes).toContain('LARGE_CHANGE');
  });

  it('does not flag a small change', () => {
    expect(flagPayslip(clean, 43_000).map((f) => f.code)).not.toContain('LARGE_CHANGE');
  });

  it('says nothing when there is no previous month', () => {
    expect(flagPayslip(clean, null).map((f) => f.code)).not.toContain('LARGE_CHANGE');
  });

  it('flags excessive overtime', () => {
    const r = calculateNetSalary(base({ overtimeMinutes: 50 * 60 }));
    expect(flagPayslip(r, null).map((f) => f.code)).toContain('EXCESSIVE_OVERTIME');
  });

  it('flags deductions over half of gross', () => {
    const r = calculateNetSalary(base({ otherDeductions: 30_000 }));
    expect(flagPayslip(r, null).map((f) => f.code)).toContain('HIGH_DEDUCTIONS');
  });

  it('flags a dues shortfall and zero net together', () => {
    const r = calculateNetSalary(base({ baseSalary: 5_000, duesInstallment: 9_000 }));
    const codes = flagPayslip(r, null).map((f) => f.code);
    expect(codes).toContain('DUES_SHORTFALL');
    expect(codes).toContain('ZERO_NET');
  });

  it('flags nothing on an ordinary payslip', () => {
    expect(flagPayslip(clean, 44_000)).toHaveLength(0);
  });

  it('distinguishes an unset salary from deductions eating the pay', () => {
    // Both are zero net, but only one is fixed in Salary Structure.
    const unset = calculateNetSalary(base({ baseSalary: 0, allowances: 0 }));
    const codes = flagPayslip(unset, null).map((f) => f.code);
    expect(codes).toContain('NO_SALARY');
    expect(codes).not.toContain('ZERO_NET');

    const consumed = calculateNetSalary(base({ otherDeductions: 99_999 }));
    const codes2 = flagPayslip(consumed, null).map((f) => f.code);
    expect(codes2).toContain('ZERO_NET');
    expect(codes2).not.toContain('NO_SALARY');
  });
});

describe('explaining the unpaid-leave deduction', () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('says nothing when there was no unpaid leave', () => {
    expect(describeUnpaidLeave([], 4000)).toBeNull();
  });

  it('says nothing for a spell that fell entirely on non-working days', () => {
    // A "spell" of zero working days is a weekend. There is no pay to
    // withhold, so there is nothing to explain either.
    expect(describeUnpaidLeave(
      [{ leaveType: 'Unpaid', from: d('2026-03-14'), to: d('2026-03-15'), days: 0 }],
      4000,
    )).toBeNull();
  });

  it('names the days, the rate and the dates', () => {
    // The three things an employee checks against their own calendar.
    expect(describeUnpaidLeave(
      [{ leaveType: 'Unpaid', from: d('2026-03-12'), to: d('2026-03-14'), days: 3 }],
      4347.83,
    )).toBe('3 unpaid days at PKR 4,347.83 per day. Unpaid: 12–14 Mar.');
  });

  it('writes a single day without a range', () => {
    expect(describeUnpaidLeave(
      [{ leaveType: 'Unpaid', from: d('2026-03-20'), to: d('2026-03-20'), days: 1 }],
      4000,
    )).toBe('1 unpaid day at PKR 4,000.00 per day. Unpaid: 20 Mar.');
  });

  it('groups several stretches of the same type onto one line', () => {
    expect(describeUnpaidLeave(
      [
        { leaveType: 'Unpaid', from: d('2026-03-12'), to: d('2026-03-13'), days: 2 },
        { leaveType: 'Unpaid', from: d('2026-03-20'), to: d('2026-03-20'), days: 1 },
      ],
      4000,
    )).toBe('3 unpaid days at PKR 4,000.00 per day. Unpaid: 12–13 Mar, 20 Mar.');
  });

  it('keeps different leave types apart', () => {
    const note = describeUnpaidLeave(
      [
        { leaveType: 'Unpaid', from: d('2026-03-12'), to: d('2026-03-12'), days: 1 },
        { leaveType: 'Sabbatical', from: d('2026-03-23'), to: d('2026-03-24'), days: 2 },
      ],
      4000,
    );
    expect(note).toContain('Unpaid: 12 Mar');
    expect(note).toContain('Sabbatical: 23–24 Mar');
  });

  it('spells out both months when a spell crosses one', () => {
    // Clipping should prevent this, but a note that silently dropped the
    // month would be unreadable if it ever happened.
    expect(describeUnpaidLeave(
      [{ leaveType: 'Unpaid', from: d('2026-03-30'), to: d('2026-04-02'), days: 4 }],
      4000,
    )).toContain('30 Mar–2 Apr');
  });

  it('reports the total across every stretch, not the longest', () => {
    const note = describeUnpaidLeave(
      [
        { leaveType: 'Unpaid', from: d('2026-03-02'), to: d('2026-03-06'), days: 5 },
        { leaveType: 'Unpaid', from: d('2026-03-16'), to: d('2026-03-17'), days: 2 },
      ],
      1000,
    );
    expect(note).toContain('7 unpaid days');
  });
});

describe('when a month may be paid', () => {
  const at = (iso: string) => new Date(iso);

  it('refuses the first of the month', () => {
    // A payslip for a month nobody has worked: zero overtime and zero
    // deductions for everybody, frozen that way because drafts never
    // recompute.
    expect(monthHasEnded(10, 2026, at('2026-10-01T09:00:00Z'))).toBe(false);
  });

  it('refuses mid-month', () => {
    expect(monthHasEnded(10, 2026, at('2026-10-15T12:00:00Z'))).toBe(false);
  });

  it('still refuses during the last day', () => {
    // Somebody can work the 31st, and someone else can take leave on it.
    expect(monthHasEnded(10, 2026, at('2026-10-31T09:00:00Z'))).toBe(false);
    expect(monthHasEnded(10, 2026, at('2026-10-31T23:59:59.000Z'))).toBe(false);
  });

  it('allows it once the month is over', () => {
    expect(monthHasEnded(10, 2026, at('2026-11-01T00:00:00Z'))).toBe(true);
  });

  it('allows a month long past', () => {
    expect(monthHasEnded(9, 2026, at('2026-11-01T00:00:00Z'))).toBe(true);
  });

  it('handles December rolling into the new year', () => {
    expect(monthHasEnded(12, 2026, at('2026-12-31T23:00:00Z'))).toBe(false);
    expect(monthHasEnded(12, 2026, at('2027-01-01T00:30:00Z'))).toBe(true);
  });

  it('handles February in a leap year', () => {
    // 2028 is a leap year: the 29th exists and must be worked first.
    expect(monthHasEnded(2, 2028, at('2028-02-29T10:00:00Z'))).toBe(false);
    expect(monthHasEnded(2, 2028, at('2028-03-01T00:00:00Z'))).toBe(true);
  });

  it('puts the boundary at the end of the last day, not the start', () => {
    expect(endOfPayrollMonth(10, 2026).toISOString()).toBe('2026-10-31T23:59:59.999Z');
    expect(endOfPayrollMonth(2, 2028).toISOString()).toBe('2028-02-29T23:59:59.999Z');
  });

  it('names the month for the message a person reads', () => {
    expect(payrollMonthName(10, 2026)).toBe('October 2026');
    expect(payrollMonthName(1, 2027)).toBe('January 2027');
  });
});

describe('when payroll opens', () => {
  it('is the day after the month ends, not its last day', () => {
    // Somebody can work the 31st and somebody else can take leave on it,
    // so the month is not complete until it is over.
    expect(payrollOpensOn(10, 2026).toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(payrollOpensOn(11, 2026).toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('rolls into the next year for December', () => {
    expect(payrollOpensOn(12, 2026).toISOString().slice(0, 10)).toBe('2027-01-01');
  });

  it('agrees with the rule that gates it', () => {
    // The date in the message must be a date the guard actually accepts.
    for (const [m, y] of [[10, 2026], [12, 2026], [2, 2028]] as const) {
      expect(monthHasEnded(m, y, payrollOpensOn(m, y))).toBe(true);
    }
  });
});
