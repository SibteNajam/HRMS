import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-6', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-h1 text-content-primary">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-body-sm text-content-secondary">{subtitle}</p>
        )}
      </div>
      {/* At most one primary plus two secondary. More goes in a ⋯ menu. */}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
