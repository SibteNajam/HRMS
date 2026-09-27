'use client';

import { useState } from 'react';
import {
  CalendarOff, ChevronDown, CircleAlert, CircleCheck, Clock, Info,
  TriangleAlert, Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DecisionContext, DecisionFlag } from '@/types';
import { summarise, type Verdict } from './verdict';

const VERDICT: Record<
  Verdict,
  { icon: typeof Info; wrap: string; text: string; dot: string }
> = {
  blocked: {
    icon: CircleAlert,
    wrap: 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)]',
    text: 'text-danger',
    dot: 'bg-danger',
  },
  check: {
    icon: TriangleAlert,
    wrap: 'border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]',
    text: 'text-warning',
    dot: 'bg-warning',
  },
  clear: {
    icon: CircleCheck,
    wrap: 'border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]',
    text: 'text-success',
    dot: 'bg-success',
  },
};

const LEVEL_TEXT: Record<DecisionFlag['level'], string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-content-secondary',
};

/**
 * Verdict first, numbers on demand.
 *
 * Four tiles of equal weight make the reader do the judging and turn a queue
 * of twenty into a scrolling exercise. One coloured line answers "can I
 * approve this?"; the detail stays one click away for the cases that need it.
 */
export function DecisionPanel({ ctx }: { ctx: DecisionContext }) {
  const [open, setOpen] = useState(false);
  const s = summarise(ctx);
  const v = VERDICT[s.verdict];
  const Glyph = v.icon;

  return (
    <div className={cn('mt-4 rounded-lg border', v.wrap)}>
      <div className="flex items-start gap-3 p-3.5">
        <Glyph size={18} strokeWidth={2} className={cn('mt-0.5 shrink-0', v.text)} aria-hidden />

        <div className="min-w-0 flex-1">
          <p className={cn('text-body font-semibold', v.text)}>{s.headline}</p>

          {s.reassurance && (
            <p className="mt-0.5 text-body-sm text-content-secondary">
              {s.reassurance}
            </p>
          )}

          {s.points.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {s.points.map((f) => (
                <li key={f.code} className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full',
                      f.level === 'danger'
                        ? 'bg-danger'
                        : f.level === 'warning'
                          ? 'bg-warning'
                          : 'bg-line-strong',
                    )}
                  />
                  <p className="text-body-sm leading-snug">
                    <span className={cn('font-medium', LEVEL_TEXT[f.level])}>
                      {f.label}
                    </span>
                    <span className="text-content-secondary"> — {f.detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2.5 inline-flex items-center gap-1 text-body-sm font-medium text-content-secondary transition-colors hover:text-content-primary"
          >
            {open ? 'Hide' : 'View'} the numbers
            <ChevronDown
              size={14}
              className={cn('transition-transform duration-200 ease-out', open && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="grid gap-2.5 border-t border-line-subtle p-3.5 sm:grid-cols-4">
            <Metric
              icon={CircleCheck}
              label={`Attendance · ${ctx.attendance.windowDays}d`}
              value={
                ctx.attendance.percentage === null
                  ? '—'
                  : `${ctx.attendance.percentage.toFixed(0)}%`
              }
              tone={
                ctx.attendance.percentage !== null && ctx.attendance.percentage < 80
                  ? 'danger'
                  : 'default'
              }
              sub={
                ctx.attendance.percentage === null
                  ? 'No records yet'
                  : ctx.attendance.previousPercentage !== null
                    ? `was ${ctx.attendance.previousPercentage.toFixed(0)}%`
                    : 'No prior period'
              }
            />
            <Metric
              icon={Clock}
              label="Late arrivals"
              value={String(ctx.attendance.lateCount)}
              tone={ctx.attendance.lateCount >= 3 ? 'warning' : 'default'}
              sub={`${ctx.attendance.absentDays} absent`}
            />
            <Metric
              icon={CalendarOff}
              label="Balance after"
              value={ctx.balance.allocated > 0 ? `${ctx.balance.afterApproval}d` : '∞'}
              tone={
                ctx.balance.afterApproval < 0
                  ? 'danger'
                  : ctx.balance.afterApproval === 0 && ctx.balance.allocated > 0
                    ? 'warning'
                    : 'default'
              }
              sub={
                ctx.balance.allocated > 0
                  ? `${ctx.balance.remaining} of ${ctx.balance.allocated} now`
                  : 'Unpaid — no quota'
              }
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

          <p className="border-t border-line-subtle px-3.5 py-2.5 text-caption text-content-tertiary">
            {ctx.history.daysTakenThisYear} days taken this year across{' '}
            {ctx.history.requestsThisYear} request
            {ctx.history.requestsThisYear === 1 ? '' : 's'}
            {ctx.history.rejectedThisYear > 0 &&
              ` · ${ctx.history.rejectedThisYear} rejected`}{' '}
            · {ctx.history.tenureMonths} month
            {ctx.history.tenureMonths === 1 ? '' : 's'} tenure
          </p>
        </div>
      </div>
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
    <div className="rounded-md border border-line-subtle bg-surface-raised px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-content-tertiary">
        <Glyph size={12} strokeWidth={2} aria-hidden />
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.04em]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          'tabular mt-0.5 font-display text-h3 font-bold',
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
