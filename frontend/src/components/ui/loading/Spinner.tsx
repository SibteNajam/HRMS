import { cn } from '@/lib/cn';

const SIZES = { xs: 14, sm: 16, md: 20, lg: 28, xl: 40 } as const;

/**
 * Two counter-rotating arcs drawn as SVG strokes.
 *
 * A single rotating ring is the default everywhere and reads as generic.
 * Two arcs at different speeds give depth for the same cost, and because
 * they use currentColor they inherit whatever context they sit in.
 */
export function Spinner({
  size = 'md',
  className,
  label = 'Loading',
}: {
  size?: keyof typeof SIZES;
  className?: string;
  label?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: px, height: px }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="absolute inset-0 animate-spin-slow">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2"
                opacity="0.16" />
        <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" className="absolute inset-0 animate-spin-reverse">
        <path d="M12 17.5a5.5 5.5 0 0 1-5.5-5.5" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
