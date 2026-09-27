import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

/**
 * Status is never carried by colour alone — every badge takes a label, and a
 * status badge should also take an icon.
 */
const TONES: Record<Tone, string> = {
  success:
    'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success border-[color-mix(in_srgb,var(--success)_30%,transparent)]',
  warning:
    'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-warning border-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
  danger:
    'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger border-[color-mix(in_srgb,var(--danger)_30%,transparent)]',
  info:
    'bg-[color-mix(in_srgb,var(--info)_12%,transparent)] text-info border-[color-mix(in_srgb,var(--info)_30%,transparent)]',
  brand:
    'bg-brand-50 text-brand-700 border-brand-200 dark:bg-[var(--color-primary-subtle)] dark:text-[var(--color-primary)] dark:border-transparent',
  neutral: 'bg-surface-sunken text-content-secondary border-line-subtle',
};

export function Badge({
  tone = 'neutral',
  icon: Glyph,
  small,
  className,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  small?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        small ? 'h-5 gap-1 px-2 text-[11px]' : 'h-6 gap-1.5 px-2.5 text-caption',
        Glyph && (small ? 'pl-1.5' : 'pl-2'),
        TONES[tone],
        className,
      )}
    >
      {Glyph && <Glyph size={14} strokeWidth={2} aria-hidden />}
      {children}
    </span>
  );
}
