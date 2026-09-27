import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-raised p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <SkeletonCircle size={40} />
        <div className="flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="stagger flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
