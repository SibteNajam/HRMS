'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CircleSlash, Sparkles, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useDecideApplicationMutation, type Application,
} from '@/store/api/endpoints/recruitmentApi';

type Decision = 'SHORTLISTED' | 'REJECTED' | 'HIRED';

const OPTIONS: {
  value: Decision;
  label: string;
  detail: string;
  icon: typeof Sparkles;
  tone: string;
}[] = [
  {
    value: 'SHORTLISTED',
    label: 'Take further',
    detail: 'Emails them a link to choose an interview time.',
    icon: Sparkles,
    tone: 'text-success',
  },
  {
    value: 'REJECTED',
    label: 'Reject',
    detail: 'Emails them. This is the only message the system will not send on its own.',
    icon: CircleSlash,
    tone: 'text-danger',
  },
  {
    value: 'HIRED',
    label: 'Hired',
    detail: 'Records the outcome. No email is sent — an offer is a conversation.',
    icon: UserCheck,
    tone: 'text-[var(--color-primary)]',
  },
];

/**
 * The step the scorer is not allowed to take.
 *
 * A note is required on every decision, because a candidate asking "why?"
 * six months later deserves an answer that is not "the system said so".
 */
export function DecideDialog({
  application, onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const [decision, setDecision] = useState<Decision>(
    application.score !== null &&
      application.score >= (application.posting?.shortlistThreshold ?? 70)
      ? 'SHORTLISTED'
      : 'REJECTED',
  );
  const [note, setNote] = useState('');
  const [decide, { isLoading }] = useDecideApplicationMutation();

  const chosen = OPTIONS.find((o) => o.value === decision)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await decide({ id: application.id, decision, note: note.trim() }).unwrap();
      toast.success(`${application.candidateName} marked ${chosen.label.toLowerCase()}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <form
        onSubmit={submit}
        className="animate-scale-in relative w-full max-w-[520px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl"
      >
        <h2 className="font-display text-h3 text-content-primary">
          {application.candidateName}
        </h2>
        <p className="mt-1 text-body-sm text-content-secondary">
          {application.posting?.title}
          {application.score !== null && ` · scored ${application.score}`}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                decision === o.value
                  ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]'
                  : 'border-line-subtle hover:bg-surface-hover',
              )}
            >
              <input
                type="radio"
                name="decision"
                className="sr-only"
                checked={decision === o.value}
                onChange={() => setDecision(o.value)}
              />
              <o.icon size={17} strokeWidth={2} className={cn('mt-0.5 shrink-0', o.tone)} aria-hidden />
              <span className="min-w-0">
                <span className="block text-body font-semibold text-content-primary">
                  {o.label}
                </span>
                <span className="block text-body-sm text-content-secondary">{o.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 mb-4">
          <label htmlFor="note" className="mb-1.5 block text-body-sm font-medium text-content-primary">
            Your reason <span className="text-danger">*</span>
          </label>
          <textarea
            id="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Strong on the stack we actually use and has shipped at our scale."
            className="w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
          />
          <p className="mt-1 text-caption text-content-tertiary">
            Recorded against your name. The candidate never sees it.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={note.trim().length < 5}>
            {chosen.label}
          </Button>
        </div>
      </form>
    </div>
  );
}
