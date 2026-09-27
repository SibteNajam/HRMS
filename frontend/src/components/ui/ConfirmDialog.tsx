'use client';

import { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', tone = 'danger', loading = false,
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        className={cn(
          'relative w-full max-w-[420px] rounded-xl bg-surface-overlay p-6 shadow-xl',
          'border border-line-subtle',
        )}
      >
        <div className="flex gap-3.5">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              tone === 'danger'
                ? 'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger'
                : 'bg-surface-selected text-content-selected',
            )}
          >
            <TriangleAlert size={20} strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              id="confirm-title"
              className="font-display text-h3 text-content-primary"
            >
              {title}
            </h2>
            <p className="mt-1.5 text-body-sm leading-relaxed text-content-secondary">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
