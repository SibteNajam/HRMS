import { cn } from '@/lib/cn';

/**
 * Cadre mark.
 *
 * Four rounded units locked into a square — a cadre is a core group of people
 * held in formation. The top-left unit is filled and offset forward: the
 * individual the system is currently looking at, still part of the group.
 *
 * Drawn on a 32x32 grid, 3px stroke, round joins, so it sits with Lucide icons
 * at stroke 1.75 when scaled down.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-8 w-8', className)}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="11" height="11" rx="3.5" fill="currentColor" />
      <rect
        x="18" y="3" width="11" height="11" rx="3.5"
        stroke="currentColor" strokeWidth="2.5" opacity="0.45"
      />
      <rect
        x="3" y="18" width="11" height="11" rx="3.5"
        stroke="currentColor" strokeWidth="2.5" opacity="0.45"
      />
      <rect
        x="18" y="18" width="11" height="11" rx="3.5"
        stroke="currentColor" strokeWidth="2.5" opacity="0.45"
      />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="h-8 w-8 text-[var(--color-primary)]" />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-[19px] font-extrabold tracking-[-0.03em] text-content-primary">
            Cadre
          </span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
            People Operations
          </span>
        </div>
      )}
    </div>
  );
}
