import { cn } from '@/lib/cn';

/**
 * Skeletons must be shaped like the content they replace, or the layout
 * jumps when real data arrives — which is more jarring than a spinner.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className={cn('skeleton', className)} style={style} />;
}

/** Text lines with a short last line, the way a real paragraph wraps. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 ? '62%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Skeleton
      className={cn('rounded-full', className)}
      style={{ width: size, height: size }}
    />
  );
}
