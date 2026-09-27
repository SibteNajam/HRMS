'use client';

import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, optional, className, id, children, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
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
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-10 w-full appearance-none rounded-sm border bg-surface-raised px-3 pr-9',
              'text-body text-content-primary transition-colors duration-100',
              'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-tertiary',
              error
                ? 'border-danger focus:border-danger'
                : 'border-line-default hover:border-line-strong focus:border-[var(--color-primary)]',
              'focus:outline-none',
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary"
            aria-hidden
          />
        </div>

        <div className="min-h-[22px] pt-1">
          {error ? (
            <p id={`${selectId}-error`} className="text-body-sm text-danger">{error}</p>
          ) : hint ? (
            <p id={`${selectId}-hint`} className="text-body-sm text-content-tertiary">{hint}</p>
          ) : null}
        </div>
      </div>
    );
  },
);
Select.displayName = 'Select';
