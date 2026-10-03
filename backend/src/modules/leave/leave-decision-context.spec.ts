import { describe, expect, it } from 'vitest';
import {
  buildFlags, CLEAR_FLAG, contextFingerprint, DECISION_RULES, describeRules,
  evaluateRules, floorFromFlags, THRESHOLDS, verdictFloor,
  autoApprovable, autoApprovalNote,
  type Facts, type TeamStaffing,
} from './leave-decision-context.js';

/** A request with nothing wrong with it. Each test bends one thing. */
function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    attendance: {
      windowDays: THRESHOLDS.WINDOW_DAYS,
      percentage: 94, previousPercentage: 93,
      presentDays: 60, lateCount: 0, absentDays: 2, onLeaveDays: 1, workingDays: 64,
      ...overrides.attendance,
    },
    balance: { allocated: 14, used: 4, remaining: 10, afterApproval: 7, ...overrides.balance },
    history: {
      daysTakenThisYear: 4, requestsThisYear: 2, rejectedThisYear: 0, tenureMonths: 30,
      ...overrides.history,
    },
    coverage: {
      departmentSize: 8, othersOffInRange: 1, othersOffNames: [],
      designation: 'Backend Engineer', sameRoleSize: 3, sameRoleOff: 0, sameRoleOffNames: [],
      ...overrides.coverage,
    },
    // Not on any project by default — most tests are about the person, and
    // an empty list is also the real state of anyone unassigned.
    staffing: { teams: [], ...overrides.staffing },
  };
}

/** A project team with room to spare unless a test narrows it. */
function team(over: Partial<TeamStaffing> = {}): TeamStaffing {
  return {
    project: 'Apollo Platform',
    team: 'Tech',
    minimumStaff: 4,
    teamSize: 8,
    alreadyOff: 2,
    offNames: ['Hamza Iqbal', 'Zainab Ali'],
    availableIfApproved: 5,
    roleOnTeam: 'Backend Engineer',
    sameRoleSize: 5,
    sameRoleOff: 1,
    sameRoleOffNames: ['Hamza Iqbal'],
    ...over,
  };
}

const GOOD_REASON = 'Attending my sister\'s wedding in Lahore, back on the Monday.';
const codes = (f: Facts, reason = GOOD_REASON) =>
  evaluateRules(f, reason).map((h) => h.rule.code);

describe('rules', () => {
  it('finds nothing wrong with a clean request', () => {
    expect(codes(facts())).toEqual([]);
    expect(buildFlags(facts(), GOOD_REASON)).toEqual([CLEAR_FLAG]);
  });

  it('flags a request longer than the balance left', () => {
    expect(codes(facts({ balance: { allocated: 14, used: 12, remaining: 2, afterApproval: -3 } })))
      .toContain('INSUFFICIENT_BALANCE');
  });

  it('flags attendance below the standard the report names', () => {
    const low = facts({ attendance: { ...facts().attendance, percentage: 72 } });
    expect(codes(low)).toContain('LOW_ATTENDANCE');
  });

  it('does not treat a missing attendance rate as poor attendance', () => {
    // A new joiner has no rate. Reading null as 0% would flag them for
    // something they have had no chance to do.
    const none = facts({ attendance: { ...facts().attendance, percentage: null } });
    expect(codes(none)).toContain('NO_ATTENDANCE_DATA');
    expect(codes(none)).not.toContain('LOW_ATTENDANCE');
  });

  it('flags a decline only when it is larger than the threshold', () => {
    const base = facts().attendance;
    const edge = facts({ attendance: { ...base, percentage: 80, previousPercentage: 95 } });
    const over = facts({ attendance: { ...base, percentage: 79, previousPercentage: 95 } });
    expect(codes(edge)).not.toContain('DECLINING_ATTENDANCE');
    expect(codes(over)).toContain('DECLINING_ATTENDANCE');
  });

  it('flags coverage when enough of the department is already off', () => {
    const clash = facts({
      coverage: {
        departmentSize: 5, othersOffInRange: 2, othersOffNames: ['Ali', 'Sara'],
        designation: 'Backend Engineer', sameRoleSize: 4, sameRoleOff: 1,
        sameRoleOffNames: ['Ali (14 Sep–18 Sep)'],
      },
    });
    const hit = evaluateRules(clash, GOOD_REASON).find((h) => h.rule.code === 'TEAM_COVERAGE');
    expect(hit?.flag.detail).toContain('Ali, Sara');
  });

  it('ignores coverage in a department of one', () => {
    // One person being off is 100% of a team of one, which is not a finding.
    const alone = facts({
      coverage: {
        departmentSize: 1, othersOffInRange: 0, othersOffNames: [],
        designation: 'Office Manager', sameRoleSize: 1, sameRoleOff: 0, sameRoleOffNames: [],
      },
    });
    expect(codes(alone)).not.toContain('TEAM_COVERAGE');
  });

  it('flags a reason too short to judge', () => {
    expect(codes(facts(), 'leave')).toContain('THIN_REASON');
  });
});

describe('the verdict floor', () => {
  it('approves when no rule fires', () => {
    expect(verdictFloor(evaluateRules(facts(), GOOD_REASON))).toBe('APPROVE');
  });

  it('rejects when a blocking rule fires', () => {
    const over = facts({ balance: { allocated: 14, used: 14, remaining: 0, afterApproval: -2 } });
    expect(verdictFloor(evaluateRules(over, GOOD_REASON))).toBe('REJECT');
  });

  it('raises to review when a concern fires', () => {
    const low = facts({ attendance: { ...facts().attendance, percentage: 61 } });
    expect(verdictFloor(evaluateRules(low, GOOD_REASON))).toBe('REVIEW');
  });

  it('does not raise for notes alone', () => {
    // Lateness and a brief reason are worth showing HR. Neither is a reason
    // to stop an otherwise clean request.
    const noisy = facts({
      attendance: { ...facts().attendance, lateCount: 6 },
      history: { ...facts().history, rejectedThisYear: 2 },
    });
    expect(codes(noisy, 'sick').length).toBeGreaterThan(2);
    expect(verdictFloor(evaluateRules(noisy, 'sick'))).toBe('APPROVE');
  });

  it('reaches the same floor from the flags alone', () => {
    // The recommendation service holds flags, not facts. The two routes
    // must not be able to disagree.
    for (const f of [
      facts(),
      facts({ attendance: { ...facts().attendance, percentage: 55 } }),
      facts({ balance: { allocated: 5, used: 5, remaining: 0, afterApproval: -1 } }),
    ]) {
      expect(floorFromFlags(buildFlags(f, GOOD_REASON)))
        .toBe(verdictFloor(evaluateRules(f, GOOD_REASON)));
    }
  });

  it('treats the CLEAR placeholder as approve', () => {
    expect(floorFromFlags([CLEAR_FLAG])).toBe('APPROVE');
  });
});

describe('adding a factor is one array entry', () => {
  // The property the whole design exists for: a rule appended tomorrow
  // reaches HR, reaches the model and moves the verdict, with no other edit.
  const NEW_RULE = {
    code: 'PEAK_SEASON',
    level: 'warning' as const,
    weight: 'concern' as const,
    meaning: 'Falls inside the year-end close, when the finance team cannot spare anyone.',
    applies: () => true,
    describe: () => ({ label: 'Year-end close', detail: 'These dates fall in the close period.' }),
  };

  it('fires, reaches the prompt and raises the floor without touching anything else', () => {
    DECISION_RULES.push(NEW_RULE);
    try {
      expect(codes(facts())).toContain('PEAK_SEASON');
      expect(describeRules()).toContain('PEAK_SEASON');
      expect(verdictFloor(evaluateRules(facts(), GOOD_REASON))).toBe('REVIEW');
      expect(floorFromFlags(buildFlags(facts(), GOOD_REASON))).toBe('REVIEW');
    } finally {
      DECISION_RULES.pop();
    }
  });
});

describe('the generated rule book', () => {
  it('describes every rule under its weight', () => {
    const text = describeRules();
    for (const rule of DECISION_RULES) {
      expect(text, rule.code).toContain(rule.code);
      expect(text, rule.code).toContain(rule.meaning);
    }
  });

  it('gives each rule a distinct code and a meaning worth reading', () => {
    const all = DECISION_RULES.map((r) => r.code);
    expect(new Set(all).size).toBe(all.length);
    for (const rule of DECISION_RULES) {
      expect(rule.meaning.length, rule.code).toBeGreaterThan(30);
    }
  });

  it('keeps blocking reserved for things that truly block', () => {
    // A blocking rule forces a rejection in code. Only a rule the approve
    // endpoint itself would refuse belongs here.
    expect(DECISION_RULES.filter((r) => r.weight === 'blocking').map((r) => r.code))
      .toEqual(['INSUFFICIENT_BALANCE']);
  });
});

describe('role coverage', () => {
  const twoEngineers = (off: number) =>
    facts({
      // A healthy-looking department: twelve people, only one away.
      coverage: {
        departmentSize: 12,
        othersOffInRange: off,
        othersOffNames: ['Ahmed Raza'],
        designation: 'Backend Engineer',
        sameRoleSize: 2,
        sameRoleOff: off,
        sameRoleOffNames: off ? ['Ahmed Raza (14 Sep–18 Sep)'] : [],
      },
    });

  it('catches the clash the department ratio misses', () => {
    // Two backend engineers in a team of twelve is 8% of the department and
    // 100% of the capability. The ratio says fine; the role says nobody is
    // left who can do the work.
    const found = codes(twoEngineers(1));
    expect(found).toContain('ROLE_UNCOVERED');
    expect(found).not.toContain('TEAM_COVERAGE');
  });

  it('names who is off and when', () => {
    const hit = evaluateRules(twoEngineers(1), GOOD_REASON)
      .find((h) => h.rule.code === 'ROLE_UNCOVERED');
    expect(hit?.flag.label).toBe('No other Backend Engineer available');
    expect(hit?.flag.detail).toBe(
      'Ahmed Raza (14 Sep–18 Sep) is the only other Backend Engineer, and is ' +
        'already off across these dates. Approving this would leave the role uncovered.',
    );
  });

  it('sends it to a person rather than approving it', () => {
    expect(verdictFloor(evaluateRules(twoEngineers(1), GOOD_REASON))).toBe('REVIEW');
  });

  it('stays quiet while someone else can still do the job', () => {
    expect(codes(twoEngineers(0))).not.toContain('ROLE_UNCOVERED');

    const spareCapacity = facts({
      coverage: {
        departmentSize: 12, othersOffInRange: 1, othersOffNames: ['Ahmed'],
        designation: 'Backend Engineer',
        sameRoleSize: 4, sameRoleOff: 1, sameRoleOffNames: ['Ahmed (14 Sep–18 Sep)'],
      },
    });
    // Four engineers, one off: two are still there.
    expect(codes(spareCapacity)).not.toContain('ROLE_UNCOVERED');
  });

  it('does not fire for the only person who holds the job', () => {
    // There is nobody else to be off. Flagging this would mean the sole
    // office manager could never take leave.
    const sole = facts({
      coverage: {
        departmentSize: 6, othersOffInRange: 0, othersOffNames: [],
        designation: 'Office Manager', sameRoleSize: 1, sameRoleOff: 0, sameRoleOffNames: [],
      },
    });
    expect(codes(sole)).not.toContain('ROLE_UNCOVERED');
  });

  it('counts plainly when there are several others', () => {
    const bigger = facts({
      coverage: {
        departmentSize: 20, othersOffInRange: 2, othersOffNames: ['Ahmed', 'Sara'],
        designation: 'Backend Engineer',
        sameRoleSize: 4, sameRoleOff: 3,
        sameRoleOffNames: ['Ahmed (14–18 Sep)', 'Sara (15–19 Sep)', 'Omar (14–20 Sep)'],
      },
    });
    const hit = evaluateRules(bigger, GOOD_REASON).find((h) => h.rule.code === 'ROLE_UNCOVERED');
    expect(hit?.flag.detail).toContain('3 of the other 3 Backend Engineers are already off');
  });

  it('fires alongside team coverage when both are true', () => {
    const everyone = facts({
      coverage: {
        departmentSize: 4, othersOffInRange: 2, othersOffNames: ['Ahmed', 'Sara'],
        designation: 'Backend Engineer',
        sameRoleSize: 2, sameRoleOff: 1, sameRoleOffNames: ['Ahmed (14 Sep–18 Sep)'],
      },
    });
    expect(codes(everyone)).toEqual(expect.arrayContaining(['ROLE_UNCOVERED', 'TEAM_COVERAGE']));
  });
});


describe('the staleness fingerprint', () => {
  // Stored advice is only worth reusing while it is about the same
  // situation. These are the changes that must invalidate it, and the
  // stability that makes reuse possible at all.
  const hash = (f: Facts, reason = GOOD_REASON) => contextFingerprint(f, reason);

  it('is stable for the same facts', () => {
    expect(hash(facts())).toBe(hash(facts()));
  });

  it('changes when a colleague is approved off', () => {
    const before = facts();
    const after = facts({
      coverage: { ...facts().coverage, othersOffInRange: 2, sameRoleOff: 1 },
    });
    expect(hash(after)).not.toBe(hash(before));
  });

  it('changes when the balance moves', () => {
    const after = facts({ balance: { allocated: 14, used: 6, remaining: 8, afterApproval: 5 } });
    expect(hash(after)).not.toBe(hash(facts()));
  });

  it('changes when attendance is recorded', () => {
    const after = facts({ attendance: { ...facts().attendance, absentDays: 3, percentage: 91 } });
    expect(hash(after)).not.toBe(hash(facts()));
  });

  it('changes when the request itself is edited', () => {
    expect(hash(facts(), 'A different reason entirely, with more detail.'))
      .not.toBe(hash(facts()));
  });

  it('fits the column it is stored in', () => {
    // CHAR(40) in the schema. A longer digest would be silently truncated
    // and every comparison would then match.
    expect(hash(facts())).toHaveLength(40);
  });
});

describe('project staffing', () => {
  const onProject = (over: Partial<TeamStaffing> = {}) =>
    facts({ staffing: { teams: [team(over)] } });

  it('says nothing while the team keeps its minimum', () => {
    // Eight on the team, two already off, approving leaves five. The
    // minimum is four, so there is nothing to raise.
    expect(codes(onProject())).toEqual([]);
  });

  it('allows the request that lands exactly on the minimum', () => {
    // Four needed, four left. A minimum is the number that must remain,
    // not the number you must stay above.
    expect(codes(onProject({ alreadyOff: 3, availableIfApproved: 4 }))).toEqual([]);
  });

  it('flags the request that goes one below', () => {
    const found = codes(onProject({ alreadyOff: 4, availableIfApproved: 3 }));
    expect(found).toContain('PROJECT_UNDERSTAFFED');
  });

  it('names the team, the numbers and who is already off', () => {
    const hit = evaluateRules(
      onProject({ alreadyOff: 4, availableIfApproved: 3, offNames: ['Hamza Iqbal', 'Zainab Noor'] }),
      GOOD_REASON,
    ).find((h) => h.rule.code === 'PROJECT_UNDERSTAFFED');

    expect(hit?.flag.label).toBe('Apollo Platform · Tech below minimum');
    expect(hit?.flag.detail).toContain('leaves 3 people available of 8');
    expect(hit?.flag.detail).toContain('this team needs 4');
    expect(hit?.flag.detail).toContain('Hamza Iqbal, Zainab Noor');
  });

  it('reports the worst team when several are affected', () => {
    const many = facts({
      staffing: {
        teams: [
          team({ team: 'Marketing', minimumStaff: 2, teamSize: 3, availableIfApproved: 1 }),
          team({ team: 'Tech', minimumStaff: 4, teamSize: 8, availableIfApproved: 1 }),
        ],
      },
    });
    const hit = evaluateRules(many, GOOD_REASON)
      .find((h) => h.rule.code === 'PROJECT_UNDERSTAFFED');
    // Tech is three short; Marketing is one short. The bigger shortfall is
    // the one that decides whether this can go ahead.
    expect(hit?.flag.label).toContain('Tech');
    expect(hit?.flag.detail).toContain('1 other team is also affected');
  });

  it('flags a role nobody else on the project can do', () => {
    // Two backend engineers on the team and the other one is off: the
    // headcount can look fine while the skill is simply not there.
    const found = codes(onProject({ sameRoleSize: 2, sameRoleOff: 1, sameRoleOffNames: ['Hamza Iqbal'] }));
    expect(found).toContain('PROJECT_ROLE_UNCOVERED');
  });

  it('stays quiet while another person can do the job', () => {
    // Five backend engineers, one off: three others remain.
    expect(codes(onProject({ sameRoleSize: 5, sameRoleOff: 1 })))
      .not.toContain('PROJECT_ROLE_UNCOVERED');
  });

  it('ignores a role only one person holds', () => {
    // There is nobody else to be off. Flagging this would mean the only
    // designer on a project could never take leave.
    expect(codes(onProject({ roleOnTeam: 'Tech Lead', sameRoleSize: 1, sameRoleOff: 0 })))
      .not.toContain('PROJECT_ROLE_UNCOVERED');
  });

  it('says nothing at all for somebody on no project', () => {
    expect(codes(facts({ staffing: { teams: [] } }))).toEqual([]);
  });
});

describe('approving without a person', () => {
  it('goes through when no rule objects', () => {
    expect(autoApprovable(evaluateRules(facts(), GOOD_REASON))).toBe(true);
  });

  it('stops for a staffing breach', () => {
    const short = facts({
      staffing: { teams: [team({ alreadyOff: 4, availableIfApproved: 3 })] },
    });
    expect(autoApprovable(evaluateRules(short, GOOD_REASON))).toBe(false);
  });

  it('stops for anything a person was meant to weigh', () => {
    const low = facts({ attendance: { ...facts().attendance, percentage: 61 } });
    expect(autoApprovable(evaluateRules(low, GOOD_REASON))).toBe(false);
  });

  it('is not stopped by notes alone', () => {
    // Lateness and a brief reason are worth showing HR. Neither is a reason
    // to make somebody wait for a clean request.
    const noisy = facts({ attendance: { ...facts().attendance, lateCount: 6 } });
    expect(autoApprovable(evaluateRules(noisy, 'sick'))).toBe(true);
  });

  it('agrees with the recommendation floor, always', () => {
    // Two routes to the same judgement. If they could disagree, a request
    // could be auto-approved while the queue said it needed review.
    for (const f of [
      facts(),
      facts({ attendance: { ...facts().attendance, percentage: 55 } }),
      facts({ balance: { allocated: 5, used: 5, remaining: 0, afterApproval: -1 } }),
      facts({ staffing: { teams: [team({ availableIfApproved: 2 })] } }),
      facts({ staffing: { teams: [team()] } }),
    ]) {
      const hits = evaluateRules(f, GOOD_REASON);
      expect(autoApprovable(hits)).toBe(verdictFloor(hits) === 'APPROVE');
    }
  });

  it('stops the moment a new concern rule is added', () => {
    // The property the whole weight system exists for: a factor added
    // tomorrow narrows what goes through automatically, with no edit here.
    DECISION_RULES.push({
      code: 'BLACKOUT_PERIOD',
      level: 'warning',
      weight: 'concern',
      meaning: 'Falls inside the year-end close, when nobody is released.',
      applies: () => true,
      describe: () => ({ label: 'Year-end close', detail: 'These dates fall in the close period.' }),
    });
    try {
      expect(autoApprovable(evaluateRules(facts(), GOOD_REASON))).toBe(false);
    } finally {
      DECISION_RULES.pop();
    }
  });
});

describe('the note HR reads', () => {
  it('says what it checked, with the numbers', () => {
    const note = autoApprovalNote(facts({ staffing: { teams: [team()] } }), 'Annual');
    expect(note).toContain('Approved automatically');
    expect(note).toContain('10 days of Annual leave remaining, 7 after this');
    expect(note).toContain('attendance 94%');
    expect(note).toContain('Apollo Platform · Tech keeps 5 of 8 available against a minimum of 4');
  });

  it('falls back to the department for somebody on no project', () => {
    const note = autoApprovalNote(facts(), 'Annual');
    expect(note).toContain('1 of 8 in the department are off');
  });
});
