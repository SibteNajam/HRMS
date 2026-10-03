import { describe, expect, it } from 'vitest';
import { Role } from '../../../common/enums/role.enum.js';
import { AccessDenied } from './access-policy.js';
import { REGISTRY } from './entity-registry.js';
import { buildSelect, plan, valueAt } from './query-planner.js';
import { QuerySchema, type HrQuery } from './query-schema.js';

const ME = 7;
const employee = { role: Role.EMPLOYEE, employeeId: ME };
const hr = { role: Role.HR, employeeId: 12 };

/** Goes through the validator first, exactly as a real call does. */
const query = (q: unknown): HrQuery => QuerySchema.parse(q);
const build = (q: unknown, viewer = employee) => plan(REGISTRY, query(q), viewer);

describe('the scope cannot be escaped', () => {
  it('puts the scope first in the AND chain', () => {
    const p = build({ entity: 'attendance' });
    expect((p.where.AND as unknown[])[0]).toEqual({ employeeId: ME });
  });

  it('keeps the scope when the model filters for somebody else', () => {
    // The closest thing to an attack this interface allows: naming another
    // person in a filter. It narrows within the employee's own rows and
    // returns nothing, which is the correct outcome.
    const p = build({
      entity: 'attendance',
      filters: [{ field: 'employeeCode', op: 'eq', value: 'EMP-099' }],
    });
    const clauses = p.where.AND as Record<string, unknown>[];
    expect(clauses[0]).toEqual({ employeeId: ME });
    expect(clauses).toHaveLength(2);
  });

  it('adds no scope clause for HR', () => {
    const p = build({ entity: 'attendance' }, hr);
    expect(p.where.AND).toEqual([]);
  });

  it('refuses an entity the role cannot reach', () => {
    expect(() => build({ entity: 'payrollRun' })).toThrow(AccessDenied);
  });

  it('refuses an entity that does not exist', () => {
    expect(() => build({ entity: 'salaries' })).toThrow(AccessDenied);
  });
});

describe('filters', () => {
  it('turns a date string into a UTC-anchored Date', () => {
    // A string left as a string matches nothing, which reads as "you have no
    // attendance" rather than as a broken query.
    const p = build({
      entity: 'attendance',
      filters: [{ field: 'date', op: 'gte', value: '2026-09-01' }],
    });
    const clause = (p.where.AND as Record<string, { gte: Date }>[])[1];
    expect(clause.date.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('nests a filter that reaches through a relation', () => {
    const p = build(
      { entity: 'attendance', filters: [{ field: 'department', op: 'eq', value: 'Sales' }] },
      hr,
    );
    expect((p.where.AND as unknown[])[0]).toEqual({
      employee: { department: { name: { equals: 'Sales' } } },
    });
  });

  it('rejects a value outside an enum and names the real ones', () => {
    try {
      build({ entity: 'attendance', filters: [{ field: 'status', op: 'eq', value: 'SICK' }] });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('ON_LEAVE');
    }
  });

  it('accepts an enum in any case', () => {
    const p = build({
      entity: 'attendance',
      filters: [{ field: 'status', op: 'eq', value: 'late' }],
    });
    expect((p.where.AND as Record<string, { equals: string }>[])[1].status.equals).toBe('LATE');
  });

  it('refuses "contains" on a number', () => {
    expect(() =>
      build({ entity: 'leaveRequest', filters: [{ field: 'days', op: 'contains', value: '2' }] }),
    ).toThrow(AccessDenied);
  });

  it('handles in, isNull and notNull', () => {
    const p = build({
      entity: 'attendance',
      filters: [
        { field: 'status', op: 'in', value: ['LATE', 'ABSENT'] },
        { field: 'checkOut', op: 'isNull' },
      ],
    });
    const clauses = p.where.AND as Record<string, Record<string, unknown>>[];
    expect(clauses[1].status).toEqual({ in: ['LATE', 'ABSENT'] });
    expect(clauses[2].checkOut).toEqual({ equals: null });
  });

  it('refuses a filter on a field the role cannot see', () => {
    // Filtering is a read: "salary greater than X" leaks the salary of
    // whoever comes back, one bit at a time.
    expect(() =>
      build({ entity: 'employee', filters: [{ field: 'baseSalary', op: 'gt', value: 100 }] }),
    ).toThrow(AccessDenied);
  });
});

describe('grouping and metrics', () => {
  it('counts when a grouping names no metric', () => {
    const p = build({ entity: 'attendance', groupBy: ['status'] });
    expect(p.mode).toBe('aggregate');
    expect(p.metrics.map((m) => m.name)).toEqual(['count']);
  });

  it('refuses to group by a date', () => {
    // One group per day is not an answer to anything.
    expect(() => build({ entity: 'attendance', groupBy: ['date'] })).toThrow(AccessDenied);
  });

  it('groups by a relation field', () => {
    const p = build({ entity: 'attendance', groupBy: ['department'] }, hr);
    expect(p.groupBy[0].path).toBe('employee.department.name');
  });

  it('selects the columns a computed metric needs', () => {
    // Overtime is derived from check-in and check-out. Neither appears in
    // the answer, and both must still be read.
    const p = build({
      entity: 'attendance',
      groupBy: ['department'],
      metrics: ['overtimeMinutes'],
    }, hr);
    expect(p.select).toHaveProperty('checkIn', true);
    expect(p.select).toHaveProperty('checkOut', true);
  });

  it('sorts by the first metric descending when nothing is said', () => {
    // "Which department has the most overtime" never says "sort descending".
    const p = build({
      entity: 'attendance',
      groupBy: ['department'],
      metrics: ['overtimeMinutes'],
    }, hr);
    expect(p.orderBy).toEqual({ key: 'overtimeMinutes', direction: 'desc' });
  });

  it('refuses to order by something not in the result', () => {
    expect(() =>
      build({ entity: 'attendance', groupBy: ['status'], orderBy: { key: 'department' } }, hr),
    ).toThrow(AccessDenied);
  });

  it('refuses a metric the role cannot see', () => {
    expect(() => build({ entity: 'employee', metrics: ['totalBaseSalary'] })).toThrow(AccessDenied);
  });
});

describe('listing rows', () => {
  it('returns every visible field when none is named', () => {
    const p = build({ entity: 'employee' });
    const names = p.fields.map((f) => f.name);
    expect(names).toContain('designation');
    // The role filter applies to the implicit selection too, or "select
    // everything" would quietly become the way around it.
    expect(names).not.toContain('baseSalary');
    expect(names).not.toContain('email');
  });

  it('gives HR the restricted fields in the same implicit selection', () => {
    expect(build({ entity: 'employee' }, hr).fields.map((f) => f.name)).toContain('baseSalary');
  });

  it('caps the row limit and the group limit separately', () => {
    expect(build({ entity: 'attendance', limit: 200 }).limit).toBe(200);
    expect(build({ entity: 'attendance', groupBy: ['status'], limit: 200 }).limit).toBe(50);
  });

  it('falls back to the entity default order', () => {
    expect(build({ entity: 'attendance' }).orderBy).toEqual({ key: 'date', direction: 'desc' });
  });
});

describe('select building', () => {
  it('merges dot paths into nested selects', () => {
    expect(buildSelect(['date', 'employee.department.name', 'employee.designation'])).toEqual({
      date: true,
      employee: { select: { department: { select: { name: true } }, designation: true } },
    });
  });

  it('does not let a bare relation overwrite a leaf beneath it', () => {
    expect(buildSelect(['employee.firstName', 'employee'])).toEqual({
      employee: { select: { firstName: true } },
    });
  });

  it('reads a value back out of the nested shape', () => {
    const row = { employee: { department: { name: 'Sales' } } };
    expect(valueAt(row, 'employee.department.name')).toBe('Sales');
    expect(valueAt(row, 'employee.missing.name')).toBeUndefined();
  });
});

describe('the validator', () => {
  it('rejects a limit beyond the cap', () => {
    expect(QuerySchema.safeParse({ entity: 'attendance', limit: 5000 }).success).toBe(false);
  });

  it('rejects an operator it does not know', () => {
    expect(
      QuerySchema.safeParse({
        entity: 'attendance',
        filters: [{ field: 'date', op: 'regex', value: '.*' }],
      }).success,
    ).toBe(false);
  });

  it('rejects grouping more than two deep', () => {
    expect(
      QuerySchema.safeParse({ entity: 'attendance', groupBy: ['a', 'b', 'c'] }).success,
    ).toBe(false);
  });
});
