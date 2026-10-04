import { cn } from '@/lib/cn';

/**
 * A score, coloured against the bar it was judged by.
 *
 * The threshold is per posting, so the same 72 is a pass for one role and a
 * near miss for another. Colouring against a fixed scale would quietly lie
 * about which of those a reader is looking at.
 */
export function ScoreBadge({
  score, threshold, className,
}: {
  score: number | null;
  threshold: number;
  className?: string;
}) {
  if (score === null) {
    return (
      <span className={cn('text-body-sm text-content-tertiary', className)}>
        Not scored
      </span>
    );
  }

  const tone =
    score >= threshold
      ? 'border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-success'
      : score >= threshold - 15
        ? 'border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-warning'
        : 'border-line-default bg-surface-sunken text-content-tertiary';

  return (
    <span
      className={cn(
        'tabular inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 font-display font-bold',
        tone,
        className,
      )}
      title={`Threshold for this role is ${threshold}`}
    >
      {score}
      <span className="text-caption font-medium opacity-70">/ {threshold}</span>
    </span>
  );
}
