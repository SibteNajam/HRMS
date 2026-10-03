'use client';

import { BadgeCheck, CircleAlert, Scale, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { LeaveRecommendation } from '@/store/api/endpoints/leaveApi';

const VERDICT = {
  APPROVE: {
    icon: BadgeCheck,
    label: 'Recommends approving',
    wrap: 'border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]',
    text: 'text-success',
  },
  REVIEW: {
    icon: TriangleAlert,
    label: 'Needs your judgement',
    wrap: 'border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]',
    text: 'text-warning',
  },
  REJECT: {
    icon: CircleAlert,
    label: 'Recommends rejecting',
    wrap: 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]',
    text: 'text-danger',
  },
} as const;

/**
 * The AI's advice on one request.
 *
 * Deliberately framed as a recommendation a person weighs, not a decision
 * already taken. The R&D report §14 requires the human to remain the
 * decider, and wording that reads like a verdict invites rubber-stamping —
 * which would satisfy the code path while defeating the design.
 */
export function Recommendation({ rec }: { rec: LeaveRecommendation }) {
  const v = VERDICT[rec.verdict];
  const Glyph = v.icon;

  return (
    <div className={cn('mt-4 rounded-lg border', v.wrap)}>
      <div className="flex items-start gap-3 p-3.5">
        <Glyph size={18} strokeWidth={2} className={cn('mt-0.5 shrink-0', v.text)} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-[0.06em] text-content-tertiary">
              <Sparkles size={11} strokeWidth={2.5} />
              AI
            </span>
            <span className={cn('text-body font-semibold', v.text)}>{v.label}</span>
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-content-tertiary">
              {rec.confidence} confidence
            </span>
          </div>

          <p className="mt-1 text-body leading-snug text-content-primary">{rec.reason}</p>

          {/* An override is shown rather than silently applied. If the rules
              engine moved the verdict, the reviewer should see that it was
              the rules and not the model that did it. */}
          {rec.adjusted && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-surface-raised px-2 py-1.5 text-caption text-content-secondary">
              <Scale size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <span>{rec.adjusted}</span>
            </p>
          )}

          {rec.basis.length > 0 && (
            <>
              <p className="mt-2.5 text-caption font-medium text-content-tertiary">
                Based on
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {rec.basis.map((b, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-surface-raised px-2 py-1 text-caption text-content-secondary"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-2.5 text-caption text-content-tertiary">
            Advice only — the decision and the record are yours. Check the
            figures below before you act on it.
          </p>
        </div>
      </div>
    </div>
  );
}
