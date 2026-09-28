/**
 * Every attendance calculation, as pure functions.
 *
 * Nothing here touches the database or the AI. These are the figures payroll
 * multiplies by money, so they must be reproducible and testable in isolation.
 */

export interface AttendancePolicy {
  standardWorkHours: number;
  /** "09:00" */
  workDayStart: string;
  lateThresholdMinutes: number;
  overtimeRateMultiplier: number;
  /** 0 = Sunday … 6 = Saturday */
  weekendDays: number[];
}

export type DerivedStatus = 'PRESENT' | 'LATE' | 'HALF_DAY';

/** UTC midnight for a date-only value. See leave-policy for why. */
export function dateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(
      value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(),
    ));
  }
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isWeekend(date: Date, weekendDays: number[]): boolean {
  return weekendDays.includes(dateOnly(date).getUTCDay());
}

/**
 * Status at check-in.
 *
 * Late is measured against the configured start time plus a grace period —
 * both from .env, because "late" is an organisational policy and not
 * something to hardcode in a service.
 */
export function statusAtCheckIn(
  checkIn: Date,
  policy: AttendancePolicy,
): 'PRESENT' | 'LATE' {
  const [h, m] = policy.workDayStart.split(':').map(Number);
  const cutoff = new Date(checkIn);
  cutoff.setHours(h, m + policy.lateThresholdMinutes, 0, 0);
  return checkIn > cutoff ? 'LATE' : 'PRESENT';
}

/** Minutes between check-in and check-out. Null while still working. */
export function minutesWorked(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const mins = Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);
  return mins > 0 ? mins : 0;
}

/**
 * Status at check-out. A short day becomes HALF_DAY; a day that started late
 * stays LATE, because arriving late is the fact worth recording.
 */
export function statusAtCheckOut(
  current: 'PRESENT' | 'LATE',
  minutes: number,
  policy: AttendancePolicy,
): DerivedStatus {
  const halfDayCutoff = (policy.standardWorkHours / 2) * 60;
  if (minutes < halfDayCutoff) return 'HALF_DAY';
  return current;
}

/** Overtime beyond the standard day. Never stored — always derived. */
export function overtimeMinutes(
  minutes: number | null,
  policy: AttendancePolicy,
): number {
  if (minutes === null) return 0;
  return Math.max(0, minutes - policy.standardWorkHours * 60);
}

export interface AttendanceTotals {
  workingDays: number;
  presentDays: number;
  lateCount: number;
  absentDays: number;
  halfDays: number;
  onLeaveDays: number;
  holidayDays: number;
  minutesWorked: number;
  overtimeMinutes: number;
  /** null when there are no working days — not the same as 0%. */
  attendancePercentage: number | null;
}

/**
 * Attendance percentage.
 *
 *   attended    = present + late + half × 0.5
 *   workingDays = present + late + half + absent
 *
 * Approved leave and holidays are excluded from the denominator entirely.
 * Leave is an entitlement; counting it as absence penalises someone for
 * using what they were given.
 */
export function totalsFrom(
  rows: {
    status: string;
    checkIn: Date | null;
    checkOut: Date | null;
  }[],
  policy: AttendancePolicy,
): AttendanceTotals {
  let presentDays = 0, lateCount = 0, absentDays = 0, halfDays = 0;
  let onLeaveDays = 0, holidayDays = 0, worked = 0, overtime = 0;

  for (const r of rows) {
    switch (r.status) {
      case 'PRESENT': presentDays++; break;
      case 'LATE': lateCount++; break;
      case 'HALF_DAY': halfDays++; break;
      case 'ABSENT': absentDays++; break;
      case 'ON_LEAVE': onLeaveDays++; break;
      case 'HOLIDAY': holidayDays++; break;
    }
    const mins = minutesWorked(r.checkIn, r.checkOut);
    if (mins !== null) {
      worked += mins;
      overtime += overtimeMinutes(mins, policy);
    }
  }

  const workingDays = presentDays + lateCount + halfDays + absentDays;
  const attended = presentDays + lateCount + halfDays * 0.5;

  return {
    workingDays,
    presentDays,
    lateCount,
    absentDays,
    halfDays,
    onLeaveDays,
    holidayDays,
    minutesWorked: worked,
    overtimeMinutes: overtime,
    attendancePercentage:
      workingDays > 0 ? Number(((attended / workingDays) * 100).toFixed(1)) : null,
  };
}

/** Every working date in a range, excluding weekends and holidays. */
export function workingDatesIn(
  from: Date,
  to: Date,
  policy: AttendancePolicy,
  holidays: Set<string>,
): Date[] {
  const dates: Date[] = [];
  const cursor = dateOnly(from);
  const last = dateOnly(to);

  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    if (!policy.weekendDays.includes(cursor.getUTCDay()) && !holidays.has(key)) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
