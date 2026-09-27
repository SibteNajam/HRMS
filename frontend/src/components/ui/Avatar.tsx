import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-[11px]',
  lg: 'h-10 w-10 text-body-sm',
  xl: 'h-12 w-12 text-body',
} as const;

/** Deterministic tint from the name, so a person is always the same colour. */
const TINTS = [
  'bg-brand-100 text-brand-700',
  'bg-[color-mix(in_srgb,var(--info)_14%,transparent)] text-info',
  'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success',
  'bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning',
];

function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const parts = name.trim().split(/\s+/);
  const letters = (
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  ).toUpperCase();

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZES[size],
        tintFor(name),
        className,
      )}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}
