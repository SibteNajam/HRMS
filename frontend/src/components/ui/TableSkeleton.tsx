import { Skeleton, SkeletonCircle } from './loading/Skeleton';
import { cn } from '@/lib/cn';

/**
 * Shaped like the table it replaces, with staggered rows so it reads as
 * content arriving rather than a placeholder sitting there.
 */
export function TableSkeleton({
  rows = 8,
  columns = 4,
  avatar = true,
}: {
  rows?: number;
  columns?: number;
  avatar?: boolean;
}) {
  return (
    <div className="stagger" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-line-subtle px-4 py-3.5 last:border-0"
        >
          {avatar && <SkeletonCircle size={40} />}
          {Array.from({ length: columns - (avatar ? 1 : 0) }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-3.5', c === 0 && 'shrink-0')}
              style={{
                width:
                  c === 0 ? '26%' : c === columns - 2 ? '10%' : `${18 - c * 2}%`,
              }}
            />
          ))}
          <div className="flex-1" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}
