'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/** Rejection requires a note — the employee is entitled to know why. */
export function RejectDialog({
  open, name, loading, onConfirm, onCancel,
}: {
  open: boolean;
  name: string;
  loading: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  if (!open) return null;

  const tooShort = note.trim().length < 5;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onCancel} aria-hidden />
      <div className="animate-scale-in relative w-full max-w-[460px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl">
        <h2 className="font-display text-h3 text-content-primary">
          Reject {name}&apos;s leave?
        </h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          They will be notified with this reason. It is shown on their leave
          screen, so write something they can act on.
        </p>

        <label htmlFor="reject-note" className="mt-4 block text-body-sm font-medium text-content-primary">
          Reason
        </label>
        <textarea
          id="reject-note"
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Two others are already off that week — can you move it to the following Monday?"
          className="mt-1.5 w-full resize-y rounded-sm border border-line-default bg-surface-raised p-3 text-body text-content-primary placeholder:text-content-tertiary focus:border-[var(--color-primary)] focus:outline-none"
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={tooShort}
            onClick={() => onConfirm(note.trim())}
          >
            Reject request
          </Button>
        </div>
      </div>
    </div>
  );
}
