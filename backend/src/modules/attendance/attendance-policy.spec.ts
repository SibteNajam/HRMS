import { describe, expect, it } from 'vitest';
import {
  dateOnly, isWeekend, minutesWorked, overtimeMinutes,
  statusAtCheckIn, statusAtCheckOut, totalsFrom, workingDatesIn,
  type AttendancePolicy,
} from './attendance-policy.js';

const policy: AttendancePolicy = {
  standardWorkHours: 8,
  workDayStart: '09:00',
  lateThresholdMinutes: 15,
  overtimeRateMultiplier: 1.5,
  weekendDays: [0, 6],
};

const at = (h: number, m: number) => {
  const d = new Date(2026, 8, 28);
  d.setHours(h, m, 0, 0);
  return d;
};

describe('statusAtCheckIn', () => {
  it('is PRESENT before the grace period ends', () => {
    expect(statusAtCheckIn(at(9, 14), policy)).toBe('PRESENT');
  });

  it('is PRESENT exactly on the boundary', () => {
    expect(statusAtCheckIn(at(9, 15), policy)).toBe('PRESENT');
  });

  it('is LATE one minute past the boundary', () => {
    expect(statusAtCheckIn(at(9, 16), policy)).toBe('LATE');
  });

  it('is PRESENT when early', () => {
    expect(statusAtCheckIn(at(8, 30), policy)).toBe('PRESENT');
  });
});

describe('minutesWorked', () => {
  it('measures a full day', () => {
    expect(minutesWorked(at(9, 0), at(17, 30))).toBe(510);
  });

  it('is null while still working', () => {
    expect(minutesWorked(at(9, 0), null)).toBeNull();
  });

  it('never returns a negative for a bad correction', () => {
    expect(minutesWorked(at(17, 0), at(9, 0))).toBe(0);
  });
});

describe('statusAtCheckOut', () => {
  it('becomes HALF_DAY under half the standard day', () => {
    expect(statusAtCheckOut('PRESENT', 3 * 60, policy)).toBe('HALF_DAY');
  });

  it('stays PRESENT exactly on the half-day boundary', () => {
    expect(statusAtCheckOut('PRESENT', 4 * 60, policy)).toBe('PRESENT');
  });

  it('keeps LATE on a full day — arriving late is the fact worth keeping', () => {
    expect(statusAtCheckOut('LATE', 9 * 60, policy)).toBe('LATE');
  });

  it('prefers HALF_DAY over LATE when the day was also short', () => {
    expect(statusAtCheckOut('LATE', 2 * 60, policy)).toBe('HALF_DAY');
  });
});

describe('overtimeMinutes', () => {
  it('is zero for a standard day', () => {
    expect(overtimeMinutes(8 * 60, policy)).toBe(0);
  });

  it('counts only the excess', () => {
    expect(overtimeMinutes(10 * 60 + 30, policy)).toBe(150);
  });

  it('is never negative for a short day', () => {
    expect(overtimeMinutes(4 * 60, policy)).toBe(0);
  });

  it('is zero when still working', () => {
    expect(overtimeMinutes(null, policy)).toBe(0);
  });
});

describe('totalsFrom', () => {
  const row = (status: string, inH?: number, outH?: number) => ({
    status,
    checkIn: inH === undefined ? null : at(inH, 0),
    checkOut: outH === undefined ? null : at(outH, 0),
  });

  it('excludes approved leave from the denominator', () => {
    // 8 present + 2 on leave must be 100%, not 80% — leave is an
    // entitlement, and counting it as absence penalises using it.
    const rows = [
      ...Array.from({ length: 8 }, () => row('PRESENT', 9, 17)),
      row('ON_LEAVE'), row('ON_LEAVE'),
    ];
    const t = totalsFrom(rows, policy);
    expect(t.workingDays).toBe(8);
    expect(t.attendancePercentage).toBe(100);
  });

  it('excludes holidays from the denominator', () => {
    const t = totalsFrom([row('PRESENT', 9, 17), row('HOLIDAY')], policy);
    expect(t.workingDays).toBe(1);
    expect(t.attendancePercentage).toBe(100);
  });

  it('counts a half day as half', () => {
    const t = totalsFrom([row('PRESENT', 9, 17), row('HALF_DAY', 9, 12)], policy);
    expect(t.attendancePercentage).toBe(75);
  });

  it('counts LATE as attended', () => {
    const t = totalsFrom([row('LATE', 9, 18), row('PRESENT', 9, 17)], policy);
    expect(t.attendancePercentage).toBe(100);
    expect(t.lateCount).toBe(1);
  });

  it('returns null, not zero, when there is no history', () => {
    // A new joiner has no attendance rate. Showing 0% is a false alarm on
    // the most sensitive figure in the system.
    expect(totalsFrom([], policy).attendancePercentage).toBeNull();
  });

  it('returns null when every day was leave', () => {
    expect(totalsFrom([row('ON_LEAVE')], policy).attendancePercentage).toBeNull();
  });

  it('accumulates overtime across days', () => {
    const t = totalsFrom([row('PRESENT', 9, 19), row('PRESENT', 9, 18)], policy);
    expect(t.overtimeMinutes).toBe(120 + 60);
  });
});

describe('workingDatesIn', () => {
  it('skips weekends', () => {
    // Mon 28 Sep 2026 → Sun 4 Oct: five working days
    const dates = workingDatesIn(
      dateOnly('2026-09-28'), dateOnly('2026-10-04'), policy, new Set(),
    );
    expect(dates).toHaveLength(5);
  });

  it('skips holidays', () => {
    const dates = workingDatesIn(
      dateOnly('2026-09-28'), dateOnly('2026-10-02'), policy,
      new Set(['2026-09-30']),
    );
    expect(dates).toHaveLength(4);
  });

  it('handles a single day', () => {
    expect(
      workingDatesIn(dateOnly('2026-09-28'), dateOnly('2026-09-28'), policy, new Set()),
    ).toHaveLength(1);
  });

  it('returns nothing for a weekend-only range', () => {
    expect(
      workingDatesIn(dateOnly('2026-10-03'), dateOnly('2026-10-04'), policy, new Set()),
    ).toHaveLength(0);
  });
});

describe('isWeekend', () => {
  it('detects Saturday and Sunday', () => {
    expect(isWeekend(dateOnly('2026-10-03'), [0, 6])).toBe(true);
    expect(isWeekend(dateOnly('2026-10-04'), [0, 6])).toBe(true);
    expect(isWeekend(dateOnly('2026-10-05'), [0, 6])).toBe(false);
  });

  it('supports a Friday–Saturday weekend', () => {
    expect(isWeekend(dateOnly('2026-10-02'), [5, 6])).toBe(true);
    expect(isWeekend(dateOnly('2026-10-04'), [5, 6])).toBe(false);
  });
});

describe('dateOnly', () => {
  it('does not shift a day in a positive-offset timezone', () => {
    expect(dateOnly('2026-11-16').toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });
});
