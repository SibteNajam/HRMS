import { describe, expect, it } from 'vitest';
import { Role } from '../../../common/enums/role.enum.js';
import {
  ANALYTICS_TOOLS, ANALYTICS_TOOL_NAMES,
  HR_TOOLS, HR_TOOL_NAMES, SELF_TOOLS, SELF_TOOL_NAMES,
  SHARED_TOOLS, SHARED_TOOL_NAMES, toolsForRole,
} from './tool-definitions.js';

const ALL_TOOLS = [...SELF_TOOLS, ...SHARED_TOOLS, ...ANALYTICS_TOOLS, ...HR_TOOLS];

const names = (role: Role) => toolsForRole(role).map((t) => t.function.name);

describe('tool scoping', () => {
  it('gives an EMPLOYEE self-scoped and shared tools only', () => {
    // Shared tools describe how the company works — leave policy, working
    // hours, holidays, who is off. They carry nobody's salary or records,
    // so there is nothing to scope.
    expect(names(Role.EMPLOYEE).sort()).toEqual(
      [...SELF_TOOL_NAMES, ...SHARED_TOOL_NAMES, ...ANALYTICS_TOOL_NAMES].sort(),
    );
  });

  it('an EMPLOYEE request contains NO organisation-wide tool', () => {
    // The capability boundary: the model cannot call a tool it was never
    // given, so this is what stops one employee reading another's records.
    const given = new Set(names(Role.EMPLOYEE));
    for (const hrTool of HR_TOOL_NAMES) {
      expect(given.has(hrTool)).toBe(false);
    }
  });

  it('gives HR every tier', () => {
    expect(names(Role.HR)).toHaveLength(
      SELF_TOOLS.length + SHARED_TOOLS.length + ANALYTICS_TOOLS.length + HR_TOOLS.length,
    );
  });

  it('gives the generic query tool to every role', () => {
    // It is safe for an employee to hold because what it returns is scoped
    // inside the translator, from the session. Withholding it would mean an
    // employee could not ask "how many days have I taken by leave type".
    for (const role of [Role.EMPLOYEE, Role.HR, Role.ADMIN]) {
      expect(names(role)).toContain('query_hr_data');
    }
  });

  it('keeps the three tiers disjoint', () => {
    // A tool in two tiers would make the role filter ambiguous.
    const all = [
      ...SELF_TOOL_NAMES, ...SHARED_TOOL_NAMES,
      ...ANALYTICS_TOOL_NAMES, ...HR_TOOL_NAMES,
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives ADMIN the same reach as HR', () => {
    expect(names(Role.ADMIN).sort()).toEqual(names(Role.HR).sort());
  });
});

describe('tool safety', () => {
  it('exposes no tool that writes', () => {
    // A whitelist, not a blacklist: a blacklist of write verbs has to
    // anticipate every name someone might add, and "pay" in "payslips"
    // already showed how easily that misfires.
    for (const tool of ALL_TOOLS) {
      // Every prefix here is a read verb, added one at a time and on
      // purpose. Nothing that mutates can be named this way by accident,
      // which is what a blacklist of write verbs could never promise.
      expect(tool.function.name).toMatch(/^(get|search|list|find|query|describe)_/);
    }
  });

  it('never lets the model name whose data it reads', () => {
    // A self-scoped tool with an employeeId parameter would let the model
    // pass someone else's id. The id must come from the session only.
    for (const tool of SELF_TOOLS) {
      const props = (tool.function.parameters?.properties ?? {}) as Record<string, unknown>;
      expect(Object.keys(props)).not.toContain('employeeId');
      expect(Object.keys(props)).not.toContain('employee_id');
      expect(Object.keys(props)).not.toContain('userId');
    }
  });

  it('the generic query tool names nobody either', () => {
    // It takes an entity and filters. Who the rows belong to is decided by
    // the registry from the session, so there is no parameter to abuse.
    for (const tool of ANALYTICS_TOOLS) {
      const props = (tool.function.parameters?.properties ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(props)) {
        expect(key).not.toMatch(/employee|user|person/i);
      }
    }
  });

  it('shared tools take no employee parameter either', () => {
    // If a shared tool accepted an employee id it would stop being shared
    // and become an unscoped read of someone else's records.
    for (const tool of SHARED_TOOLS) {
      const props = (tool.function.parameters?.properties ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(props)) {
        expect(key).not.toMatch(/employee|user/i);
      }
    }
  });

  it('gives every tool a description the model can choose from', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.function.description?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it('uses unique tool names', () => {
    const all = ALL_TOOLS.map((t) => t.function.name);
    expect(new Set(all).size).toBe(all.length);
  });
});
