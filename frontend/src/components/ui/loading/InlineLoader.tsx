import { Spinner } from './Spinner';
import { cn } from '@/lib/cn';

/** For a panel or section that is loading inside an already-rendered page. */
export function InlineLoader({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center gap-2.5 py-12', className)}>
      <Spinner size="sm" className="text-[var(--color-primary)]" />
      <span className="text-body-sm text-content-secondary">{label}</span>
    </div>
  );
}

/** Three breathing dots — for "the assistant is working". */
export function ThinkingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-info animate-breathe"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </span>
      {label && <span className="text-body-sm text-content-secondary">{label}</span>}
    </div>
  );
}
