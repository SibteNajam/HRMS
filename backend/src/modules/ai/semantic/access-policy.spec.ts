import { describe, expect, it } from 'vitest';
import { Role } from '../../../common/enums/role.enum.js';
import {
  AccessDenied, canUseEntity, entitiesFor, fieldFor, metricFor, nest, scopeFor,
} from './access-policy.js';
import { REGISTRY } from './entity-registry.js';
import { isGroupable, type EntityDefinition } from './entity-definition.js';

const ME = 7;
const employee = { role: Role.EMPLOYEE, employeeId: ME };
const hr = { role: Role.HR, employeeId: 12 };
const admin = { role: Role.ADMIN, employeeId: null };

const ALL_ROLES = [Role.EMPLOYEE, Role.HR, Role.ADMIN];
const entries = Object.entries(REGISTRY);

describe('row scoping', () => {
  it('pins an employee to their own rows', () => {
    expect(scopeFor('attendance', REGISTRY.attendance, employee).where).toEqual({
      employeeId: ME,
    });
  });

  it('scopes the employee entity by primary key, not by a foreign key', () => {
    // `employee` has no employeeId column — it IS the employee. Getting this
    // wrong would either match nothing or match everyone.
    expect(scopeFor('employee', REGISTRY.employee, employee).where).toEqual({ id: ME });
  });

  it('leaves HR unscoped', () => {
    expect(scopeFor('attendance', REGISTRY.attendance, hr).where).toBeNull();
  });

  it('leaves shared policy data unscoped for everyone', () => {
    expect(scopeFor('holiday', REGISTRY.holiday, employee).where).toBeNull();
    expect(scopeFor('leaveType', REGISTRY.leaveType, employee).where).toBeNull();
  });

  it('refuses an employee an entity their role cannot reach', () => {
    expect(() => scopeFor('payrollRun', REGISTRY.payrollRun, employee)).toThrow(AccessDenied);
  });

  it('refuses a restricted viewer with no employee record', () => {
    // Scoping to `undefined` would produce `where: { employeeId: undefined }`,
    // which Prisma drops — and the query would quietly return everybody.
    expect(() =>
      scopeFor('attendance', REGISTRY.attendance, { role: Role.EMPLOYEE, employeeId: null }),
    ).toThrow(AccessDenied);
  });

  it('lets an unrestricted admin through without an employee record', () => {
    expect(scopeFor('payslip', REGISTRY.payslip, admin).where).toBeNull();
  });

  it('fails closed on an entity declared without ownership or sharing', () => {
    // The case that protects the next person to edit the registry: an entity
    // added without `ownedVia` and without `shared` is refused for a
    // restricted role rather than shown in full.
    const careless = {
      ...REGISTRY.payslip,
      access: { roles: ALL_ROLES, seesEveryone: [Role.HR, Role.ADMIN] },
    } as EntityDefinition;
    expect(() => scopeFor('payslip', careless, employee)).toThrow(AccessDenied);
  });

  it('builds a nested where from a dot path', () => {
    expect(nest('employee.department.name', 'Sales')).toEqual({
      employee: { department: { name: 'Sales' } },
    });
    expect(nest('employeeId', 4)).toEqual({ employeeId: 4 });
  });
});

describe('every entity, every role', () => {
  // The sweep that keeps holding as the registry grows: whatever is added
  // tomorrow is checked by these two assertions without anybody writing a
  // new test for it.
  it.each(entries)('%s scopes or refuses each role, never neither', (name, def) => {
    for (const role of ALL_ROLES) {
      const viewer = { role, employeeId: ME };
      if (!canUseEntity(def, role)) {
        expect(() => scopeFor(name, def, viewer)).toThrow(AccessDenied);
        continue;
      }

      const scope = scopeFor(name, def, viewer);
      const unrestricted =
        def.access.seesEveryone.includes(role) || def.access.shared === true;

      if (unrestricted) {
        expect(scope.where).toBeNull();
      } else {
        // A restricted role must come back with a filter that names this
        // viewer. Anything else is an unscoped read.
        expect(scope.where).not.toBeNull();
        expect(JSON.stringify(scope.where)).toContain(String(ME));
      }
    }
  });

  it.each(entries)('%s never exposes a restricted field to a lesser role', (name, def) => {
    for (const [fieldName, field] of Object.entries(def.fields)) {
      if (!field.restrictedTo) continue;
      for (const role of ALL_ROLES) {
        if (field.restrictedTo.includes(role)) continue;
        expect(() => fieldFor(def, name, fieldName, role)).toThrow(AccessDenied);
      }
    }
  });
});

describe('field and metric resolution', () => {
  it('hides salary from an employee even on their own row', () => {
    // Row scoping is not enough here. Pay is read from a payslip, which is
    // the figure that was actually issued.
    expect(() => fieldFor(REGISTRY.employee, 'employee', 'baseSalary', Role.EMPLOYEE))
      .toThrow(AccessDenied);
    expect(fieldFor(REGISTRY.employee, 'employee', 'baseSalary', Role.HR).type)
      .toBe('number');
  });

  it('treats a restricted field as non-existent rather than forbidden', () => {
    // "You may not see baseSalary" confirms both that it exists and that
    // somebody can. An unknown-field message says neither.
    try {
      fieldFor(REGISTRY.employee, 'employee', 'baseSalary', Role.EMPLOYEE);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('is not a field of employee');
      expect((err as Error).message).not.toContain('permission');
    }
  });

  it('refuses an invented field and says what is available', () => {
    try {
      fieldFor(REGISTRY.attendance, 'attendance', 'mood', Role.HR);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('status');
    }
  });

  it('hides a restricted metric the same way', () => {
    expect(() => metricFor(REGISTRY.employee, 'employee', 'totalBaseSalary', Role.EMPLOYEE))
      .toThrow(AccessDenied);
    expect(metricFor(REGISTRY.employee, 'employee', 'totalBaseSalary', Role.HR).agg)
      .toBe('sum');
  });

  it('lists fewer entities for an employee than for HR', () => {
    const mine = entitiesFor(REGISTRY, Role.EMPLOYEE);
    const theirs = entitiesFor(REGISTRY, Role.HR);
    expect(mine.length).toBeLessThan(theirs.length);
    expect(mine).not.toContain('payrollRun');
  });
});

describe('registry invariants', () => {
  // These are about the shape of the declarations rather than any one
  // query. A registry that breaks one of them produces a query that fails
  // at runtime, in front of a user, instead of here.

  it.each(entries)('%s declares seesEveryone as a subset of roles', (_name, def) => {
    for (const role of def.access.seesEveryone) {
      expect(def.access.roles).toContain(role);
    }
  });

  it.each(entries)('%s can be scoped for every role that may reach it', (_name, def) => {
    const restricted = def.access.roles.filter((r) => !def.access.seesEveryone.includes(r));
    if (restricted.length === 0) return;
    // Either the rows belong to somebody, or they belong to nobody. There
    // is no third option that is safe.
    expect(def.access.ownedVia ?? def.access.shared).toBeTruthy();
  });

  it.each(entries)('%s aggregates only declared fields', (_name, def) => {
    for (const metric of Object.values(def.metrics)) {
      if (metric.field) expect(def.fields).toHaveProperty(metric.field);
      for (const need of metric.needs ?? []) {
        // `payments.amount` reaches into a relation the registry does not
        // list as a field; only plain names must resolve.
        if (!need.includes('.')) expect(def.fields).toHaveProperty(need);
      }
    }
  });

  it.each(entries)('%s gives every metric a description', (_name, def) => {
    for (const [metricName, metric] of Object.entries(def.metrics)) {
      expect(metric.describe.length, metricName).toBeGreaterThan(3);
      // A metric either reads a column or computes one. Neither means it
      // silently returns null for every row.
      if (metric.agg !== 'count') {
        expect(Boolean(metric.field || metric.compute), metricName).toBe(true);
      }
    }
  });

  it.each(entries)('%s orders by a field it actually has', (_name, def) => {
    if (def.defaultOrder) expect(def.fields).toHaveProperty(def.defaultOrder.field);
  });

  it.each(entries)('%s spells out the values of every enum', (_name, def) => {
    for (const [fieldName, field] of Object.entries(def.fields)) {
      if (field.type === 'enum') {
        expect(field.values?.length ?? 0, fieldName).toBeGreaterThan(1);
      }
      // Dates and numbers make useless groups; the default must reflect that.
      if (field.type === 'date' && field.groupable === undefined) {
        expect(isGroupable(field)).toBe(false);
      }
    }
  });

  it('reaches no table holding credentials', () => {
    // `users` carries the password hash and the role. It is not in the
    // registry, and this test is what stops it being added casually.
    const models = entries.map(([, def]) => def.model);
    expect(models).not.toContain('user');
    expect(models).not.toContain('roleAssignment');
    expect(models).not.toContain('auditLog');
  });

  it('never exposes a free-text field that carries someone else\'s private words', () => {
    // Leave reasons and review notes are between a person and their
    // approver. They are readable through the leave screens, which log who
    // looked; an aggregate query is not the place for them.
    expect(Object.keys(REGISTRY.leaveRequest.fields)).not.toContain('reason');
    expect(Object.keys(REGISTRY.leaveRequest.fields)).not.toContain('reviewNote');
  });
});
