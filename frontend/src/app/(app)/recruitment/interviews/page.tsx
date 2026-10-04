'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Link as LinkIcon, Mail, Video, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CardListSkeleton } from '@/components/ui/loading';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useCancelInterviewMutation, useGetInterviewsQuery, useSetMeetingLinkMutation,
  type InterviewRow,
} from '@/store/api/endpoints/recruitmentApi';

export default function InterviewsPage() {
  const { data: interviews, isLoading } = useGetInterviewsQuery();
  const [cancelling, setCancelling] = useState<InterviewRow | null>(null);
  const [linking, setLinking] = useState<InterviewRow | null>(null);

  const now = Date.now();
  const upcoming = (interviews ?? []).filter((i) => new Date(i.slot.startsAt).getTime() > now);
  const past = (interviews ?? []).filter((i) => new Date(i.slot.startsAt).getTime() <= now);

  return (
    <>
      <PageHeader
        title="Interviews"
        subtitle="Times candidates have chosen for themselves."
      />

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : !interviews?.length ? (
        <div className="animate-fade-up rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <CalendarClock size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">Nothing booked yet</h3>
          <p className="mx-auto mt-1.5 max-w-[420px] text-body-sm text-content-secondary">
            Shortlisted candidates book themselves in from the link they are
            emailed. Offer some times on a posting first.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {upcoming.length > 0 && (
            <Section
              title="Coming up" rows={upcoming}
              onCancel={setCancelling} onLink={setLinking}
            />
          )}
          {past.length > 0 && <Section title="Past" rows={past} muted />}
        </div>
      )}

      {cancelling && (
        <CancelDialog interview={cancelling} onClose={() => setCancelling(null)} />
      )}
      {linking && (
        <MeetingLinkDialog interview={linking} onClose={() => setLinking(null)} />
      )}
    </>
  );
}

function Section({
  title, rows, onCancel, onLink, muted,
}: {
  title: string;
  rows: InterviewRow[];
  onCancel?: (row: InterviewRow) => void;
  onLink?: (row: InterviewRow) => void;
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-h3 text-content-primary">
        {title} <span className="tabular text-content-tertiary">({rows.length})</span>
      </h2>
      <div className="stagger flex flex-col gap-2.5">
        {rows.map((i) => (
          <article
            key={i.id}
            className={cn(
              'flex flex-wrap items-center gap-3.5 rounded-xl border border-line-subtle bg-surface-raised p-4 shadow-sm',
              muted && 'opacity-65',
            )}
          >
            <Avatar name={i.application.candidateName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-h3 text-content-primary">
                {i.application.candidateName}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 text-body-sm text-content-secondary">
                <span className="flex items-center gap-1">
                  <Mail size={12} aria-hidden />{i.application.candidateEmail}
                </span>
                {i.application.posting && <span>{i.application.posting.title}</span>}
              </p>
            </div>

            <div className="text-right">
              <p className="tabular font-display text-h3 font-bold text-content-primary">
                {new Intl.DateTimeFormat('en-GB', {
                  hour: '2-digit', minute: '2-digit', hour12: false,
                }).format(new Date(i.slot.startsAt))}
              </p>
              <p className="text-caption text-content-tertiary">
                {new Intl.DateTimeFormat('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                }).format(new Date(i.slot.startsAt))}
              </p>
            </div>

            {onLink && (
              <Button
                size="sm"
                variant={i.meetingLink ? 'ghost' : 'secondary'}
                icon={i.meetingLink ? LinkIcon : Video}
                onClick={() => onLink(i)}
              >
                {i.meetingLink ? 'Link sent' : 'Add link'}
              </Button>
            )}
            {onCancel && (
              <Button size="sm" variant="ghost" icon={X} onClick={() => onCancel(i)}>
                Cancel
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Cancelling frees the slot and emails the candidate, so it needs a reason. */
function CancelDialog({
  interview, onClose,
}: {
  interview: InterviewRow;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [cancel, { isLoading }] = useCancelInterviewMutation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await cancel({ id: interview.id, note: note.trim() }).unwrap();
      toast.success(`${interview.application.candidateName} has been told`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <form onSubmit={submit} className="animate-scale-in relative w-full max-w-[480px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl">
        <h2 className="font-display text-h3 text-content-primary">
          Cancel {interview.application.candidateName}&rsquo;s interview
        </h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          The time goes back on offer and they are emailed a link to pick
          another. What you write here is in that email.
        </p>

        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="The interviewer is unwell and we would rather reschedule than have you meet someone else."
          className="mt-4 mb-4 w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Keep it
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={note.trim().length < 5}>
            Cancel and tell them
          </Button>
        </div>
      </form>
    </div>
  );
}


/**
 * Pasting the joining details.
 *
 * The link is made by hand — a Meet or Zoom room, set up by whoever is
 * running the interview. Automating that would mean holding calendar
 * credentials for the whole organisation to save one paste. What is not
 * left to a person is the sending: the confirmation email promised
 * joining details, and a promise kept by somebody remembering is a
 * promise broken eventually.
 */
function MeetingLinkDialog({
  interview, onClose,
}: {
  interview: InterviewRow;
  onClose: () => void;
}) {
  const [link, setLink] = useState(interview.meetingLink ?? '');
  const [note, setNote] = useState('');
  const [save, { isLoading }] = useSetMeetingLinkMutation();

  const valid = /^https?:\/\/\S{6,}$/.test(link.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({ id: interview.id, meetingLink: link.trim(), note: note.trim() || undefined }).unwrap();
      toast.success(`Joining details emailed to ${interview.application.candidateName}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <form onSubmit={submit} className="animate-scale-in relative w-full max-w-[520px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl">
        <h2 className="font-display text-h3 text-content-primary">
          Joining details for {interview.application.candidateName}
        </h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          {new Intl.DateTimeFormat('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }).format(new Date(interview.slot.startsAt))}
          {' · '}{interview.application.candidateEmail}
        </p>

        <div className="mt-5">
          <Input
            label="Meeting link" required value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://meet.google.com/abc-defg-hij"
            hint="Create the room yourself, then paste it here"
          />

          <label htmlFor="note" className="mb-1.5 block text-body-sm font-medium text-content-primary">
            Anything else they should know
          </label>
          <textarea
            id="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="You will be meeting Aisha and Ahmed. Allow an hour, and have a recent project you can talk through."
            className="mb-4 w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={!valid}>
            Send to candidate
          </Button>
        </div>
      </form>
    </div>
  );
}
