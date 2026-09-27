import {
  CalendarOff, CircleAlert, CircleCheck, Clock, Info, TrendingDown, Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DecisionContext, DecisionFlag } from '@/types';

const FLAG_STYLE: Record<DecisionFlag['level'], { wrap: string; icon: typeof Info }> = {
  danger: {
    wrap: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_28%,transparent)] text-danger',
    icon: CircleAlert,
  },
  warning: {
    wrap: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_28%,transparent)] text-warning',
    icon: TrendingDown,
  },
  info: {
    wrap: 'bg-surface-sunken border-line-subtle text-content-secondary',
    icon: Info,
  },
};

/**
 * The facts behind the decision, on the card.
 *
 * Every factor here is named in the project documents: leave balance and
 * policy, repeated lateness, a significant decline in attendance, the 80%
 * attendance standard, and whether the request needs clarification.
 */
export function DecisionPanel({ ctx }: { ctx: DecisionContext }) {
  const a = ctx.attendance;
  const declined =
    a.previousPercentage !== null && a.previousPercentage - a.percentage > 0;

  return (
    <div className="mt-4 rounded-lg border border-line-subtle bg-surface-sunken p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
        Decision factors
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          icon={CircleCheck}
          label={`Attendance · ${a.windowDays}d`}
          value={`${a.percentage.toFixed(0)}%`}
          tone={a.percentage < 80 ? 'danger' : 'default'}
          sub={
            a.previousPercentage !== null
              ? `${declined ? '↓' : '↑'} from ${a.previousPercentage.toFixed(0)}%`
              : 'No prior period'
          }
        />
        <Metric
          icon={Clock}
          label="Late arrivals"
          value={String(a.lateCount)}
          tone={a.lateCount >= 3 ? 'warning' : 'default'}
          sub={`${a.absentDays} absent`}
        />
        <Metric
          icon={CalendarOff}
          label="Balance after"
          value={`${ctx.balance.afterApproval}d`}
          tone={
            ctx.balance.afterApproval < 0
              ? 'danger'
              : ctx.balance.afterApproval === 0
                ? 'warning'
                : 'default'
          }
          sub={`${ctx.balance.remaining} of ${ctx.balance.allocated} now`}
        />
        <Metric
          icon={Users}
          label="Team off"
          value={`${ctx.coverage.othersOffInRange}/${ctx.coverage.departmentSize}`}
          tone={
            ctx.coverage.departmentSize > 1 &&
            ctx.coverage.othersOffInRange / ctx.coverage.departmentSize >= 0.4
              ? 'warning'
              : 'default'
          }
          sub="during these dates"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {ctx.flags.map((flag) => {
          const style = FLAG_STYLE[flag.level];
          const Glyph = flag.code === 'CLEAR' ? CircleCheck : style.icon;
          return (
            <div
              key={flag.code}
              className={cn(
                'flex items-start gap-2.5 rounded-md border px-3 py-2',
                flag.code === 'CLEAR'
                  ? 'border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-success'
                  : style.wrap,
              )}
            >
              <Glyph size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <p className="text-body-sm leading-snug">
                <span className="font-semibold">{flag.label}</span>
                <span className="opacity-85"> — {flag.detail}</span>
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-caption text-content-tertiary">
        Taken {ctx.history.daysTakenThisYear} days this year across{' '}
        {ctx.history.requestsThisYear} request
        {ctx.history.requestsThisYear === 1 ? '' : 's'} · {ctx.history.tenureMonths}{' '}
        month{ctx.history.tenureMonths === 1 ? '' : 's'} tenure
      </p>
    </div>
  );
}

function Metric({
  icon: Glyph, label, value, sub, tone = 'default',
}: {
  icon: typeof Info;
  label: string;
  value: string;
  sub: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div className="rounded-md border border-line-subtle bg-surface-raised p-3">
      <div className="flex items-center gap-1.5 text-content-tertiary">
        <Glyph size={13} strokeWidth={2} aria-hidden />
        <span className="truncate text-[11px] font-medium">{label}</span>
      </div>
      <p
        className={cn(
          'tabular mt-1 font-display text-h2',
          tone === 'danger'
            ? 'text-danger'
            : tone === 'warning'
              ? 'text-warning'
              : 'text-content-primary',
        )}
      >
        {value}
      </p>
      <p className="text-caption text-content-tertiary">{sub}</p>
    </div>
  );
}
