import { Role } from '../../common/enums/role.enum.js';

/**
 * Who may approve whose leave.
 *
 *   EMPLOYEE  → HR or ADMIN
 *   HR        → ADMIN only        (HR cannot approve HR)
 *   ADMIN     → another ADMIN
 *
 * The rule that makes this work is not in this table: nobody may approve
 * their own request, checked separately. Without that, an ADMIN would
 * self-approve because ADMIN is in their own approver list.
 */
export function approversFor(requesterRole: Role): Role[] {
  switch (requesterRole) {
    case Role.EMPLOYEE:
      return [Role.HR, Role.ADMIN];
    case Role.HR:
    case Role.ADMIN:
      return [Role.ADMIN];
  }
}

/** Can this reviewer act on a request from someone of that role? */
export function canReview(reviewerRole: Role, requesterRole: Role): boolean {
  return approversFor(requesterRole).includes(reviewerRole);
}

/** Which requester roles land in this reviewer's queue. */
export function reviewableRoles(reviewerRole: Role): Role[] {
  return [Role.EMPLOYEE, Role.HR, Role.ADMIN].filter((r) =>
    canReview(reviewerRole, r),
  );
}

/**
 * Parses a YYYY-MM-DD string to UTC midnight.
 *
 * `new Date('2026-11-16')` is UTC midnight, but `setHours(0,0,0,0)` then
 * reinterprets it in LOCAL time — in PKT (UTC+5) that lands on
 * 2026-11-15T19:00Z, and a MySQL DATE column stores 15 November. Leave
 * silently lands on the wrong days. Everything here stays in UTC.
 */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(
      value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(),
    ));
  }
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Working days between two dates, inclusive, excluding weekends.
 *
 * Computed once at submit and frozen on the request: if the company's
 * weekend configuration changes next year, a request approved under the old
 * calendar must not retroactively change length.
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  weekendDays: number[],
): number {
  let days = 0;
  const cursor = parseDateOnly(start);
  const last = parseDateOnly(end);

  while (cursor <= last) {
    if (!weekendDays.includes(cursor.getUTCDay())) days++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Every working date in the range — used to write ON_LEAVE attendance rows. */
export function workingDatesIn(
  start: Date,
  end: Date,
  weekendDays: number[],
): Date[] {
  const dates: Date[] = [];
  const cursor = parseDateOnly(start);
  const last = parseDateOnly(end);

  while (cursor <= last) {
    if (!weekendDays.includes(cursor.getUTCDay())) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
