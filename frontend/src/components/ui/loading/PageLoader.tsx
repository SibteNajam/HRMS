import { LogoMark } from '@/components/brand/Logo';

/**
 * Full-screen, for the initial session check only. Everywhere else a shaped
 * skeleton is better — this exists for the moment before we know who the
 * user is and therefore cannot know what to skeleton.
 */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface-page">
      <div className="relative">
        <LogoMark className="h-11 w-11 text-[var(--color-primary)] animate-breathe" />
        <span
          aria-hidden
          className="absolute -inset-4 rounded-full bg-[var(--color-primary)] opacity-[0.07] blur-xl"
        />
      </div>
      <p className="animate-fade-in text-body-sm text-content-tertiary" style={{ animationDelay: '250ms' }}>
        {label}
      </p>
    </div>
  );
}
