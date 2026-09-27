import { cn } from '@/lib/cn';

/**
 * Shaped like the table it replaces, so the layout does not jump when the
 * real rows arrive. A generic grey box tells the user nothing.
 */
export function TableSkeleton({
  rows = 8,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-line-subtle py-3 last:border-0"
        >
          <div className="h-10 w-10 shrink-0 rounded-full shimmer" />
          {Array.from({ length: columns - 1 }).map((_, c) => (
            <div
              key={c}
              className={cn(
                'h-4 rounded-sm shimmer',
                c === 0 ? 'w-[28%]' : c === columns - 2 ? 'w-[12%]' : 'w-[18%]',
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
