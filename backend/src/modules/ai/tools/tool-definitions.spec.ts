import { describe, expect, it } from 'vitest';
import { Role } from '../../../common/enums/role.enum.js';
import {
  HR_TOOLS, HR_TOOL_NAMES, SELF_TOOLS, SELF_TOOL_NAMES, toolsForRole,
} from './tool-definitions.js';

const names = (role: Role) => toolsForRole(role).map((t) => t.function.name);

describe('tool scoping', () => {
  it('gives an EMPLOYEE only self-scoped tools', () => {
    expect(names(Role.EMPLOYEE).sort()).toEqual([...SELF_TOOL_NAMES].sort());
  });

  it('an EMPLOYEE request contains NO organisation-wide tool', () => {
    // The capability boundary: the model cannot call a tool it was never
    // given, so this is what stops one employee reading another's records.
    const given = new Set(names(Role.EMPLOYEE));
    for (const hrTool of HR_TOOL_NAMES) {
      expect(given.has(hrTool)).toBe(false);
    }
  });

  it('gives HR both sets', () => {
    expect(names(Role.HR)).toHaveLength(SELF_TOOLS.length + HR_TOOLS.length);
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
    for (const tool of [...SELF_TOOLS, ...HR_TOOLS]) {
      expect(tool.function.name).toMatch(/^(get|search|list|find)_/);
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

  it('gives every tool a description the model can choose from', () => {
    for (const tool of [...SELF_TOOLS, ...HR_TOOLS]) {
      expect(tool.function.description?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it('uses unique tool names', () => {
    const all = [...SELF_TOOLS, ...HR_TOOLS].map((t) => t.function.name);
    expect(new Set(all).size).toBe(all.length);
  });
});
