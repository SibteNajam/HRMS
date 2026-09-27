import { cn } from '@/lib/cn';

export function Card({
  className,
  compact,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line-subtle bg-surface-raised shadow-sm',
        compact ? 'p-5' : 'p-6',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-h3 font-semibold text-content-primary', className)}
      {...props}
    />
  );
}

export function CardSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-body-sm text-content-secondary', className)} {...props} />;
}
