import type { DecisionContext, DecisionFlag } from '@/types';

export type Verdict = 'blocked' | 'check' | 'clear';

export interface VerdictSummary {
  verdict: Verdict;
  headline: string;
  /** The concerns, most severe first. Empty when clear. */
  points: DecisionFlag[];
  /** One line of reassurance, shown only when clear. */
  reassurance: string;
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

  const blocked = ctx.balance.afterApproval < 0;

  if (blocked) {
    return {
      verdict: 'blocked',
      headline: 'Cannot be approved — exceeds their balance',
      points: [...danger, ...warning, ...info],
      reassurance: '',
    };
  }

  if (danger.length || warning.length) {
    const n = danger.length + warning.length;
    return {
      verdict: 'check',
      headline: `${n} thing${n === 1 ? '' : 's'} to check before approving`,
      points: [...danger, ...warning, ...info],
      reassurance: '',
    };
  }

  const bits: string[] = [];
  if (ctx.attendance.percentage !== null) {
    bits.push(`attendance ${ctx.attendance.percentage.toFixed(0)}%`);
  }
  if (ctx.balance.allocated > 0) {
    bits.push(`balance ${ctx.balance.remaining} → ${ctx.balance.afterApproval}`);
  }
  if (ctx.coverage.departmentSize > 1) {
    bits.push(
      ctx.coverage.othersOffInRange === 0
        ? 'no team clash'
        : `${ctx.coverage.othersOffInRange} of ${ctx.coverage.departmentSize} team off`,
    );
  }

  return {
    verdict: 'clear',
    headline: 'Nothing to flag',
    points: info,
    reassurance: bits.join(' · '),
  };
}
