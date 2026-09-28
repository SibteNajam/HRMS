import { describe, expect, it } from 'vitest';
import {
  calculateNetSalary, flagPayslip, round2, type PayrollInput,
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
});
