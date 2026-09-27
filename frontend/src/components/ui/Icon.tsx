import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32, '2xl': 48 } as const;

export type IconSize = keyof typeof SIZES;

/**
 * Centralises icon geometry so call sites cannot drift.
 *
 * absoluteStrokeWidth is the important prop: without it stroke scales with the
 * icon, so a 16px icon renders visually thicker than a 24px one and the set
 * never looks uniform.
 */
export function Icon({
  icon: Glyph,
  size = 'md',
  strokeWidth = 1.75,
  className,
}: {
  icon: LucideIcon;
  size?: IconSize;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <Glyph
      size={SIZES[size]}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    />
  );
}
