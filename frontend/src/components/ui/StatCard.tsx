import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  /** Set when a rising number is bad — absences, overdue dues. */
  invertDelta = false,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: number;
  deltaLabel?: string;
  invertDelta?: boolean;
}) {
  const positive = delta !== undefined && delta >= 0;
  const good = invertDelta ? !positive : positive;

  return (
    // Fixed height so a row of cards aligns even when one has no delta.
    <div className="flex h-[132px] flex-col justify-between rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
          {label}
        </p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-selected">
          <Icon icon={icon} size="md" className="text-[var(--color-primary)]" />
        </span>
      </div>

      <div>
        <p className="tabular font-display text-display-lg text-content-primary">
          {value}
        </p>
        {delta !== undefined && (
          <p className="mt-1 flex items-center gap-1.5 text-body-sm">
            <span
              className={cn(
                'flex items-center gap-0.5 font-semibold',
                good ? 'text-success' : 'text-danger',
              )}
            >
              {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {Math.abs(delta).toFixed(1)}%
            </span>
            {deltaLabel && <span className="text-content-tertiary">{deltaLabel}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
