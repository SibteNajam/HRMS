'use client';

import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
  optional?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, icon: Glyph, optional, className, type, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [reveal, setReveal] = useState(false);
    const isPassword = type === 'password';
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-body-sm font-medium text-content-primary"
          >
            {label}
            {props.required && <span className="ml-0.5 text-danger">*</span>}
            {optional && (
              <span className="ml-1.5 font-normal text-content-tertiary">(optional)</span>
            )}
          </label>
        )}

        <div className="relative">
          {Glyph && (
            <Glyph
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
              aria-hidden
            />
          )}
          <input
            ref={ref}
            id={inputId}
            type={isPassword && reveal ? 'text' : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-10 w-full rounded-sm border bg-surface-raised px-3 text-body',
              'text-content-primary placeholder:text-content-tertiary',
              'transition-colors duration-100',
              'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-tertiary',
              Glyph && 'pl-9',
              isPassword && 'pr-10',
              error
                ? 'border-danger focus:border-danger'
                : 'border-line-default hover:border-line-strong focus:border-[var(--color-primary)]',
              'focus:outline-none',
              className,
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              className={cn(
                'absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center',
                'rounded-sm text-content-tertiary transition-colors hover:text-content-primary',
              )}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>

        {/* Hint and error share one slot so the form does not jump when
            validation fires. */}
        <div className="min-h-[22px] pt-1">
          {error ? (
            <p id={`${inputId}-error`} className="text-body-sm text-danger">
              {error}
            </p>
          ) : hint ? (
            <p id={`${inputId}-hint`} className="text-body-sm text-content-tertiary">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);
Input.displayName = 'Input';
