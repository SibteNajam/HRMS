import type { DecisionContext, DecisionFlag } from '@/types';
import type { LeaveRecommendation } from '@/store/api/endpoints/leaveApi';

export type Verdict = 'blocked' | 'check' | 'clear';

/** One figure worth showing without expanding anything. */
export interface Fact {
  label: string;
  value: string;
  tone: 'default' | 'warning' | 'danger';
}

export interface VerdictSummary {
  verdict: Verdict;
  headline: string;
  /** The concerns, most severe first. Empty when clear. */
  points: DecisionFlag[];
  /** The three numbers that answer "can I approve this?" at a glance. */
  facts: Fact[];
}

/**
 * Turns a set of flags into the one thing HR actually needs: a conclusion.
 *
 * Four metric tiles of equal weight make the reader do the judging. A
 * verdict does the judging and keeps the numbers available underneath.
 */
export function summarise(ctx: DecisionContext): VerdictSummary {
  const real = ctx.flags.filter((f) => f.code !== 'CLEAR');
  const danger = real.filter((f) => f.level === 'danger');
  const warning = real.filter((f) => f.level === 'warning');
  const info = real.filter((f) => f.level === 'info');

  const facts = factsFrom(ctx);
  const blocked = ctx.balance.afterApproval < 0;

  if (blocked) {
    return {
      verdict: 'blocked',
      headline: 'Cannot be approved — exceeds their balance',
      points: [...danger, ...warning, ...info],
      facts,
    };
  }

  if (danger.length || warning.length) {
    const n = danger.length + warning.length;
    return {
      verdict: 'check',
      headline: `${n} thing${n === 1 ? '' : 's'} to check before approving`,
      points: [...danger, ...warning, ...info],
      facts,
    };
  }

  return {
    verdict: 'clear',
    headline: 'Ready to approve',
    points: info,
    facts,
  };
}

/**
 * The same three figures on every card, in the same order, whatever the
 * verdict. A reviewer learns where to look once instead of re-reading a
 * sentence that is phrased differently each time.
 */
function factsFrom(ctx: DecisionContext): Fact[] {
  const facts: Fact[] = [];

  facts.push({
    label: 'Attendance',
    value: ctx.attendance.percentage === null
      ? 'No records yet'
      : `${ctx.attendance.percentage.toFixed(0)}%`,
    tone:
      ctx.attendance.percentage !== null && ctx.attendance.percentage < 80
        ? 'danger'
        : 'default',
  });

  facts.push({
    label: 'Balance',
    value: ctx.balance.allocated > 0
      ? `${ctx.balance.remaining} → ${ctx.balance.afterApproval} days`
      : 'Unpaid — no quota',
    tone:
      ctx.balance.afterApproval < 0
        ? 'danger'
        : ctx.balance.afterApproval === 0 && ctx.balance.allocated > 0
          ? 'warning'
          : 'default',
  });

  // Role cover is the sharper question when there is a job title to cover:
  // two backend engineers in a team of twelve reads as well staffed right
  // up until the other one is off.
  if (ctx.coverage.sameRoleSize > 1) {
    const others = ctx.coverage.sameRoleSize - 1;
    const free = others - ctx.coverage.sameRoleOff;
    facts.push({
      label: ctx.coverage.designation,
      value: free === 0
        ? 'None other available'
        : `${free} of ${others} others free`,
      tone: free === 0 ? 'warning' : 'default',
    });
  } else {
    facts.push({
      label: 'Team cover',
      value: ctx.coverage.othersOffInRange === 0
        ? 'Nobody else off'
        : `${ctx.coverage.othersOffInRange} of ${ctx.coverage.departmentSize} off`,
      tone:
        ctx.coverage.departmentSize > 1 &&
        ctx.coverage.othersOffInRange / ctx.coverage.departmentSize >= 0.4
          ? 'warning'
          : 'default',
    });
  }

  return facts;
}

// ─── Where the rules and the assistant differ ───────────────────────────

/**
 * Two opinions on the same request.
 *
 * `agrees` is the common case and deserves no attention. The two
 * disagreements are the only part of an AI recommendation worth a reviewer's
 * time, so they are the only part given any visual weight.
 */
export type Agreement = 'agrees' | 'stricter' | 'softer';

const RULES_RANK: Record<Verdict, number> = { clear: 0, check: 1, blocked: 2 };
const AI_RANK: Record<LeaveRecommendation['verdict'], number> = {
  APPROVE: 0, REVIEW: 1, REJECT: 2,
};

export function agreementOf(
  verdict: Verdict,
  rec: LeaveRecommendation | undefined,
): Agreement | null {
  if (!rec) return null;
  const mine = RULES_RANK[verdict];
  const theirs = AI_RANK[rec.verdict];
  if (theirs === mine) return 'agrees';
  // The assistant wants more scrutiny than the flags alone called for.
  return theirs > mine ? 'stricter' : 'softer';
}

/**
 * Sort key for the queue. Lower sorts first: what cannot go through, then
 * what needs thought, then what is ready.
 *
 * A disagreement pulls a card forward within its group, because that is the
 * case where reading the recommendation actually changes something.
 */
export function queueOrder(
  verdict: Verdict,
  rec: LeaveRecommendation | undefined,
): number {
  const group = (2 - RULES_RANK[verdict]) * 10;
  const agreement = agreementOf(verdict, rec);
  const settled = agreement === 'agrees' || agreement === null;
  return group + (settled ? 1 : 0);
}
