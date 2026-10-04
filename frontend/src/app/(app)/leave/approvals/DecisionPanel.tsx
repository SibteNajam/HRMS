'use client';

import { useState } from 'react';
import {
  ChevronDown, CircleAlert, CircleCheck, History, Info, Scale, Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { DecisionContext, DecisionFlag } from '@/types';
import type { StoredRecommendation } from '@/types';
import { agreementOf, summarise, type Agreement, type Verdict } from './verdict';

const VERDICT: Record<Verdict, { icon: typeof Info; wrap: string; text: string }> = {
  blocked: {
    icon: CircleAlert,
    wrap: 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)]',
    text: 'text-danger',
  },
  check: {
    icon: TriangleAlert,
    wrap: 'border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]',
    text: 'text-warning',
  },
  clear: {
    icon: CircleCheck,
    wrap: 'border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]',
    text: 'text-success',
  },
};

/**
 * Agreement is the only part of a recommendation worth visual weight.
 *
 * "The assistant also thinks this is fine" tells a reviewer nothing they did
 * not already have from the flags, so it is a quiet grey line. A
 * disagreement is the case where reading the recommendation changes the
 * decision, so that one gets colour.
 */
const AGREEMENT: Record<Agreement, { label: string; cls: string }> = {
  agrees: {
    label: 'AI agrees',
    cls: 'bg-surface-raised text-content-tertiary',
  },
  stricter: {
    label: 'AI wants a closer look',
    cls: 'bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning',
  },
  softer: {
    label: 'AI judges this fine',
    cls: 'bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]',
  },
};

const LEVEL_TEXT: Record<DecisionFlag['level'], string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-content-secondary',
};

const FACT_TONE = {
  default: 'text-content-primary',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/**
 * One conclusion per request.
 *
 * The rules engine and the assistant used to occupy two stacked panels of
 * the same colour, each with its own tick, saying the same thing in
 * different words. A reviewer had to read both to learn they agreed. Now
 * there is one verdict, the assistant's sentence underneath it, and the
 * three figures that support it — with the rest one click away.
 */
export function DecisionPanel({
  ctx, rec,
}: {
  ctx: DecisionContext;
  rec?: StoredRecommendation | null;
}) {
  const [open, setOpen] = useState(false);
  const s = summarise(ctx);
  const v = VERDICT[s.verdict];
  const Glyph = v.icon;
  const agreement = agreementOf(s.verdict, rec);

  return (
    <div className={cn('mt-4 overflow-hidden rounded-lg border', v.wrap)}>
      <div className="flex items-start gap-3 p-3.5">
        <Glyph size={18} strokeWidth={2} className={cn('mt-0.5 shrink-0', v.text)} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className={cn('text-body font-semibold', v.text)}>{s.headline}</p>
            {agreement && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium',
                  AGREEMENT[agreement].cls,
                )}
              >
                <Sparkles size={11} strokeWidth={2.5} aria-hidden />
                {AGREEMENT[agreement].label}
              </span>
            )}
          </div>

          {rec && (
            <p className="mt-1.5 text-body leading-snug text-content-primary">{rec.reason}</p>
          )}

          {/* Advice is kept between visits so it need not be paid for
              twice, which makes saying when it stopped matching the
              situation part of the bargain. */}
          {rec?.stale && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-1.5 text-caption text-warning">
              <History size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                The figures have changed since this was written
                {' '}({formatRelative(rec.generatedAt)}). Re-analyse for current advice.
              </span>
            </p>
          )}

          {/* An override is shown rather than silently applied: the reviewer
              should see that it was the rules and not the model that moved
              the verdict. */}
          {rec?.adjusted && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-surface-raised px-2 py-1.5 text-caption text-content-secondary">
              <Scale size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <span>{rec.adjusted}</span>
            </p>
          )}

          {s.points.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
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
                    <span className={cn('font-medium', LEVEL_TEXT[f.level])}>{f.label}</span>
                    <span className="text-content-secondary"> — {f.detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* The same three figures on every card, in the same place. A
              reviewer learns where to look once. */}
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2.5">
            {s.facts.map((f) => (
              <div key={f.label}>
                <dt className="text-[10px] font-medium uppercase tracking-[0.05em] text-content-tertiary">
                  {f.label}
                </dt>
                <dd className={cn('tabular text-body font-semibold', FACT_TONE[f.tone])}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-3 inline-flex items-center gap-1 text-body-sm font-medium text-content-secondary transition-colors hover:text-content-primary"
          >
            {open ? 'Hide' : 'More'} detail
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
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line-subtle bg-surface-raised">
            <dl className="grid gap-x-6 gap-y-3 p-3.5 sm:grid-cols-3">
              <Detail
                label="Late arrivals"
                value={`${ctx.attendance.lateCount} in ${ctx.attendance.windowDays} days`}
                tone={ctx.attendance.lateCount >= 3 ? 'warning' : 'default'}
              />
              <Detail
                label="Absences"
                value={`${ctx.attendance.absentDays} of ${ctx.attendance.workingDays} working days`}
              />
              <Detail
                label="Previous period"
                value={
                  ctx.attendance.previousPercentage === null
                    ? 'No prior period'
                    : `${ctx.attendance.previousPercentage.toFixed(0)}% attendance`
                }
              />
              <Detail
                label="Leave this year"
                value={`${ctx.history.daysTakenThisYear} days across ${ctx.history.requestsThisYear} request${ctx.history.requestsThisYear === 1 ? '' : 's'}`}
              />
              <Detail
                label="Tenure"
                value={`${ctx.history.tenureMonths} month${ctx.history.tenureMonths === 1 ? '' : 's'}`}
              />
              <Detail
                label="Prior rejections"
                value={ctx.history.rejectedThisYear === 0
                  ? 'None this year'
                  : `${ctx.history.rejectedThisYear} this year`}
                tone={ctx.history.rejectedThisYear > 0 ? 'warning' : 'default'}
              />
            </dl>

            {/* Kept out of the collapsed card but not dropped: it is the
                record of what the recommendation rested on, which is what
                makes the advice checkable rather than merely received. */}
            {rec && rec.basis.length > 0 && (
              <div className="border-t border-line-subtle px-3.5 py-2.5">
                <p className="text-caption font-medium text-content-tertiary">
                  What the assistant looked at · {formatRelative(rec.generatedAt)}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {rec.basis.map((b, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-surface-sunken px-2 py-1 text-caption text-content-secondary"
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label, value, tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.05em] text-content-tertiary">
        {label}
      </dt>
      <dd
        className={cn(
          'tabular text-body-sm font-medium',
          tone === 'warning' ? 'text-warning' : 'text-content-primary',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
