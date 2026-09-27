'use client';

import { forwardRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon, type IconSize } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-primary-solid)] text-white shadow-brand ' +
    'hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] active:shadow-none ' +
    'disabled:bg-ink-200 disabled:text-content-tertiary disabled:shadow-none',
  secondary:
    'bg-surface-raised text-content-primary border border-line-default ' +
    'hover:bg-surface-sunken active:bg-ink-100 ' +
    'disabled:bg-surface-sunken disabled:text-content-tertiary disabled:border-line-subtle',
  ghost:
    'bg-transparent text-content-secondary ' +
    'hover:bg-surface-sunken hover:text-content-primary active:bg-ink-200 ' +
    'disabled:text-content-tertiary',
  danger:
    'bg-danger text-white hover:brightness-110 active:brightness-95 ' +
    'disabled:bg-ink-200 disabled:text-content-tertiary',
  link:
    'bg-transparent text-[var(--color-primary)] underline-offset-4 hover:underline ' +
    'disabled:text-content-tertiary disabled:no-underline',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-sm rounded-sm gap-1.5',
  md: 'h-10 px-4 text-body rounded-md gap-2',
  lg: 'h-12 px-5 text-body-lg font-semibold rounded-md gap-2.5',
  icon: 'h-10 w-10 rounded-md justify-center',
};

const ICON_SIZE: Record<Size, IconSize> = {
  sm: 'xs', md: 'sm', lg: 'md', icon: 'md',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      icon,
      iconPosition = 'left',
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const showIcon = icon && !loading;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center font-medium whitespace-nowrap',
          'transition-colors duration-100 ease-out',
          'disabled:cursor-not-allowed',
          VARIANTS[variant],
          SIZES[size],
          fullWidth && 'w-full justify-center',
          className,
        )}
        {...props}
      >
        {/* The label stays visible while loading so the button does not resize. */}
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {showIcon && iconPosition === 'left' && (
          <Icon icon={icon} size={ICON_SIZE[size]} />
        )}
        {size !== 'icon' && children}
        {showIcon && iconPosition === 'right' && (
          <Icon icon={icon} size={ICON_SIZE[size]} />
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';
