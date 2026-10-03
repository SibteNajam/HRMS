'use client';

import { CircleAlert, CircleCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Agreement, Verdict } from './verdict';

/**
 * The shape of the queue in one row.
 *
 * There used to be two rows of three: the rules engine's counts above the
 * assistant's counts, six numbers describing the same ten requests. A
 * reviewer had to work out how the rows related before reading a single
 * card.
 *
 * The rules decide the state — a request either can be approved, needs
 * thought, or cannot go through. The assistant's contribution is not a
 * fourth state; it is whether it agrees. So it goes on the second line of
 * the tile it belongs to, and only says something when it differs.
 */

const TILES = [
  {
    key: 'clear' as const,
    label: 'Ready to approve',
    icon: CircleCheck,
    cls: 'border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] text-success',
  },
  {
    key: 'check' as const,
    label: 'Need a look',
    icon: TriangleAlert,
    cls: 'border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] text-warning',
  },
  {
    key: 'blocked' as const,
    label: 'Over balance',
    icon: CircleAlert,
    cls: 'border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-danger',
  },
];

export function QueueSummary({
  rows, analysed,
}: {
  rows: { verdict: Verdict; agreement: Agreement | null }[];
  analysed: boolean;
}) {
  return (
    <div className="stagger mb-5 grid gap-3 sm:grid-cols-3">
      {TILES.map((tile) => {
        const inBucket = rows.filter((r) => r.verdict === tile.key);
        const differing = inBucket.filter(
          (r) => r.agreement === 'stricter' || r.agreement === 'softer',
        ).length;

        return (
          <div key={tile.key} className={cn('rounded-lg border px-4 py-3', tile.cls)}>
            <div className="flex items-center gap-3">
              <tile.icon size={20} strokeWidth={2} aria-hidden />
              <p className="tabular font-display text-h2 font-bold">{inBucket.length}</p>
              <p className="text-body-sm font-medium opacity-90">{tile.label}</p>
            </div>

            {/* Only drawn once the assistant has actually run, and silent
                when it simply agrees — "the AI also thinks these are fine"
                is not worth a line. */}
            {analysed && inBucket.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-caption opacity-75">
                <Sparkles size={11} strokeWidth={2.5} aria-hidden />
                {differing > 0
                  ? `AI differs on ${differing} of ${inBucket.length}`
                  : 'AI agrees'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
