import { describe, expect, it } from 'vitest';
import { Role } from '../../../common/enums/role.enum.js';
import { REGISTRY } from './entity-registry.js';
import { plan } from './query-planner.js';
import { QuerySchema } from './query-schema.js';
import { present, summarise } from './query-runner.js';
import type { ComputeContext, Row } from './entity-definition.js';

const hr = { role: Role.HR, employeeId: 1 };

const CTX: ComputeContext = {
  policy: {
    standardWorkHours: 8,
    workDayStart: '09:00',
    lateThresholdMinutes: 15,
    overtimeRateMultiplier: 1.5,
    weekendDays: [0, 6],
  },
};

const build = (q: unknown) => plan(REGISTRY, QuerySchema.parse(q), hr);

/** One attendance row, with check-in and check-out as real timestamps. */
function day(department: string, status: string, inAt?: string, outAt?: string): Row {
  return {
    status,
    date: new Date('2026-09-14T00:00:00.000Z'),
    checkIn: inAt ? new Date(`2026-09-14T${inAt}:00.000Z`) : null,
    checkOut: outAt ? new Date(`2026-09-14T${outAt}:00.000Z`) : null,
    employee: { department: { name: department }, firstName: 'A', designation: 'Dev' },
  };
}

describe('grouping', () => {
  const p = build({
    entity: 'attendance',
    groupBy: ['department'],
    metrics: ['overtimeMinutes', 'count'],
  });

  it('sums a derived metric per group and ranks the groups', () => {
    // The question the hand-written tools could not answer at all:
    // "which department has the highest overtime?"
    const rows = [
      day('Engineering', 'PRESENT', '09:00', '19:00'), // 10h → 120 over
      day('Engineering', 'PRESENT', '09:00', '18:00'), //  9h →  60 over
      day('Sales', 'PRESENT', '09:00', '17:30'),       //  8.5h → 30 over
    ];
    const result = summarise(p, rows, rows.length, CTX);

    expect(result.groupedBy).toEqual(['department']);
    expect(result.results[0]).toEqual({
      department: 'Engineering', overtimeMinutes: 180, count: 2,
    });
    expect(result.results[1]).toEqual({
      department: 'Sales', overtimeMinutes: 30, count: 1,
    });
  });

  it('reports the scope it ran under', () => {
    expect(summarise(p, [], 0, CTX).scope).toBe('all records');
  });

  it('counts rows that contribute nothing to the metric', () => {
    // An unfinished day has no overtime. It is still a day of attendance,
    // so the count includes it and the sum does not.
    const rows = [day('Sales', 'PRESENT', '09:00'), day('Sales', 'PRESENT', '09:00', '18:00')];
    const result = summarise(p, rows, 2, CTX);
    expect(result.results[0]).toEqual({ department: 'Sales', overtimeMinutes: 60, count: 2 });
  });

  it('reports zero overtime for a day nobody worked', () => {
    // Zero here is a finding, not a gap: an absent day earned no overtime,
    // and that is the same answer payroll gives for it.
    const result = summarise(p, [day('Sales', 'ABSENT')], 1, CTX);
    expect(result.results[0].overtimeMinutes).toBe(0);
  });

  it('returns null when the figure genuinely is not known yet', () => {
    // Minutes worked is unknown until someone checks out. Reporting 0 would
    // say they worked nothing, which is a different claim.
    const unfinished = build({
      entity: 'attendance',
      groupBy: ['department'],
      metrics: ['minutesWorked'],
    });
    const result = summarise(unfinished, [day('Sales', 'PRESENT', '09:00')], 1, CTX);
    expect(result.results[0].minutesWorked).toBeNull();
  });

  it('labels a group with no value instead of dropping the rows', () => {
    const orphan: Row = { ...day('x', 'PRESENT'), employee: { department: {} } };
    const result = summarise(p, [orphan], 1, CTX);
    expect(result.results[0].department).toBe('Unspecified');
  });

  it('collapses to one total when nothing is grouped', () => {
    const total = build({ entity: 'attendance', metrics: ['count'] });
    const result = summarise(total, [day('A', 'PRESENT'), day('B', 'LATE')], 2, CTX);
    expect(result.results).toEqual([{ count: 2 }]);
    expect(result.groupedBy).toBeUndefined();
  });

  it('says when it showed only the top groups', () => {
    const narrow = build({ entity: 'attendance', groupBy: ['department'], limit: 1 });
    const result = summarise(narrow, [day('A', 'PRESENT'), day('B', 'PRESENT')], 2, CTX);
    expect(result.results).toHaveLength(1);
    expect(result.truncated).toContain('of 2 groups');
  });
});

describe('averages', () => {
  it('averages over the rows that had a value, not over every row', () => {
    // Dividing by every row would drag the average down with days that
    // simply have not finished yet.
    const p = build({
      entity: 'attendance',
      groupBy: ['department'],
      metrics: ['averageMinutesWorked'],
    });
    const rows = [
      day('Sales', 'PRESENT', '09:00', '17:00'), // 480
      day('Sales', 'PRESENT', '09:00', '19:00'), // 600
      day('Sales', 'PRESENT', '09:00'),          // still working
    ];
    expect(summarise(p, rows, 3, CTX).results[0].averageMinutesWorked).toBe(540);
  });
});

describe('listing rows', () => {
  const p = build({
    entity: 'attendance',
    select: ['date', 'status', 'department', 'checkIn'],
  });

  it('formats a date column as a day and a timestamp as a time', () => {
    const result = summarise(p, [day('Sales', 'LATE', '09:45', '18:00')], 1, CTX);
    expect(result.results[0].date).toBe('2026-09-14');
    expect(result.results[0].checkIn).toBe('2026-09-14T09:45:00.000Z');
    expect(result.results[0].department).toBe('Sales');
  });

  it('says how many it left out', () => {
    const narrow = build({ entity: 'attendance', select: ['status'], limit: 1 });
    const result = summarise(narrow, [day('A', 'PRESENT'), day('B', 'LATE')], 97, CTX);
    expect(result.results).toHaveLength(1);
    expect(result.truncated).toBe('Showing 1 of 97 records.');
  });
});

describe('presentation', () => {
  it('turns a Prisma Decimal into a number', () => {
    const decimal = { toString: () => '1234.50' };
    expect(present(decimal, 'number')).toBe(1234.5);
  });

  it('keeps midnight UTC as a plain day', () => {
    expect(present(new Date('2026-03-12T00:00:00.000Z'), 'date')).toBe('2026-03-12');
  });

  it('reads a boolean as a word', () => {
    expect(present(true, 'boolean')).toBe('yes');
    expect(present(false, 'boolean')).toBe('no');
  });

  it('passes null through rather than inventing a zero', () => {
    expect(present(null, 'number')).toBeNull();
    expect(present(undefined, 'string')).toBeNull();
  });
});
