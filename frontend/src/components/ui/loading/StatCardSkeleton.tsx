import { Skeleton } from './Skeleton';

/** Matches StatCard's fixed 132px height so the row does not resize. */
export function StatCardSkeleton() {
  return (
    <div className="flex h-[132px] flex-col justify-between rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <div>
        <Skeleton className="h-9 w-20" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
