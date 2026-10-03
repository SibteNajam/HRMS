import { describe, expect, it } from 'vitest';
import { Role } from '../../../common/enums/role.enum.js';
import { buildIndex, describeEntity, queryGuidance } from './catalog.js';
import { REGISTRY } from './entity-registry.js';
import { entitiesFor } from './access-policy.js';

describe('the index', () => {
  it('tells an employee nothing about the entities they cannot reach', () => {
    const mine = buildIndex(Role.EMPLOYEE);
    expect(mine).not.toContain('payrollRun');
    expect(mine).toContain('attendance');
  });

  it('gives HR the organisation-wide entities', () => {
    expect(buildIndex(Role.HR)).toContain('payrollRun');
  });

  it('marks the entities an employee only sees their own rows of', () => {
    expect(buildIndex(Role.EMPLOYEE)).toContain('attendance:');
    expect(buildIndex(Role.EMPLOYEE)).toMatch(/attendance:.*their own records only/);
    // Policy data carries no such note — there is nothing personal in it.
    expect(buildIndex(Role.EMPLOYEE)).toMatch(/holiday:(?!.*own records)/);
  });

  it('lists every entity the role may actually query', () => {
    // An entity missing from the index is one the model will never try,
    // however well it is declared.
    for (const role of [Role.EMPLOYEE, Role.HR]) {
      const index = buildIndex(role);
      for (const name of entitiesFor(REGISTRY, role)) {
        expect(index, `${role} index is missing ${name}`).toContain(`- ${name}:`);
      }
    }
  });
});

describe('entity detail', () => {
  it('hides a restricted field from the role that may not see it', () => {
    const asEmployee = describeEntity('employee', REGISTRY.employee, Role.EMPLOYEE);
    const asHr = describeEntity('employee', REGISTRY.employee, Role.HR);
    expect(asEmployee.fields.map((f) => f.name)).not.toContain('baseSalary');
    expect(asHr.fields.map((f) => f.name)).toContain('baseSalary');
  });

  it('hides a restricted metric too', () => {
    expect(describeEntity('employee', REGISTRY.employee, Role.EMPLOYEE).metrics.map((m) => m.name))
      .not.toContain('averageBaseSalary');
  });

  it('tells the model not to scope by hand', () => {
    // The model filtering by person "to be safe" would narrow a scope that
    // is already applied, and look like a bug when it returned nothing.
    const detail = describeEntity('attendance', REGISTRY.attendance, Role.EMPLOYEE);
    expect(detail.scope).toContain('never filter by person');
  });

  it('spells out the values of an enum so they are not guessed', () => {
    const status = describeEntity('attendance', REGISTRY.attendance, Role.HR)
      .fields.find((f) => f.name === 'status');
    expect(status?.values).toContain('HALF_DAY');
  });

  it('says which fields can be grouped', () => {
    const detail = describeEntity('attendance', REGISTRY.attendance, Role.HR);
    expect(detail.fields.find((f) => f.name === 'department')?.groupable).toBe(true);
    expect(detail.fields.find((f) => f.name === 'date')?.groupable).toBe(false);
  });
});

describe('prompt budget', () => {
  // The registry will grow. This is the test that notices when it starts
  // costing more per message than the free tier can spare, rather than
  // someone discovering it as a rate limit in front of a user.
  it.each([Role.EMPLOYEE, Role.HR])('keeps %s guidance under a thousand tokens', (role) => {
    const chars = queryGuidance(role).length;
    // Roughly four characters to a token.
    expect(chars / 4).toBeLessThan(1000);
  });

  it('keeps the detail of one entity small enough to fetch mid-conversation', () => {
    for (const [name, def] of Object.entries(REGISTRY)) {
      const chars = JSON.stringify(describeEntity(name, def, Role.HR)).length;
      expect(chars / 4, name).toBeLessThan(500);
    }
  });
});
