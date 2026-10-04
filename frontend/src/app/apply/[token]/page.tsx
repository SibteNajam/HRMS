'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CircleAlert, Loader2, Video } from 'lucide-react';
import { SlotCalendar, type Slot } from './SlotCalendar';

interface BookingPage {
  candidateName: string;
  role: string;
  booked: { startsAt: string; endsAt: string; meetingLink: string | null } | null;
  slots: Slot[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * The candidate's page. No login, no app shell, no navigation.
 *
 * It is reached by a link in one email, and it shows exactly two things:
 * when they could come in, and when they are coming in. Never the score,
 * never the reasoning, never the other candidates.
 */
export default function BookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<BookingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/apply/${token}`);
      if (!res.ok) throw new Error((await res.json()).message ?? 'Something went wrong');
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book(slotId: number) {
    setBusy(slotId);
    try {
      const res = await fetch(`${API}/apply/${token}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Losing a race is not an error state — the page refreshes so the
        // slot they lost is visibly gone and they can pick again.
        setError(body.message ?? 'That time could not be booked');
        await load();
        return;
      }
      setData(body);
      setError(null);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[620px] px-5 py-14">
      {!data && !error && (
        <p className="flex items-center gap-2 text-body text-content-secondary">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </p>
      )}

      {error && !data && (
        <div className="rounded-xl border border-line-subtle bg-surface-raised p-10 text-center">
          <CircleAlert size={40} strokeWidth={1.25} className="mx-auto text-content-tertiary" aria-hidden />
          <h1 className="mt-4 font-display text-h2 text-content-primary">{error}</h1>
          <p className="mx-auto mt-2 max-w-[42ch] text-body-sm text-content-secondary">
            If you think this is a mistake, reply to the email we sent you and
            we will sort it out.
          </p>
        </div>
      )}

      {data && (
        <>
          <h1 className="font-display text-display-sm text-content-primary">
            Hello {data.candidateName.split(' ')[0]}
          </h1>
          <p className="mt-2 text-body text-content-secondary">
            We would like to talk to you about the{' '}
            <span className="font-medium text-content-primary">{data.role}</span>{' '}
            role. Choose a time that suits you.
          </p>

          {data.booked ? (
            <div className="mt-8 rounded-xl border border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-6">
              <p className="flex items-center gap-2 font-semibold text-success">
                <CalendarCheck size={18} strokeWidth={2} />
                Your interview is booked
              </p>
              <p className="mt-2 font-display text-h2 text-content-primary">
                {longTime(data.booked.startsAt)}
              </p>
              {data.booked.meetingLink ? (
                <a
                  href={data.booked.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary-solid)] px-4 py-2.5 text-body-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Video size={15} strokeWidth={2} aria-hidden />
                  Join the interview
                </a>
              ) : (
                <p className="mt-1 text-body-sm text-content-secondary">
                  We will send joining details nearer the time.
                </p>
              )}
              <p className="mt-4 text-body-sm text-content-tertiary">
                Need to change it? Reply to our email and we will rearrange.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <p className="mt-6 rounded-lg border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3.5 py-3 text-body-sm text-warning">
                  {error}
                </p>
              )}

              <div className="mt-8">
                {data.slots.length === 0 ? (
                  <div className="rounded-xl border border-line-subtle bg-surface-raised p-8 text-center">
                    <p className="text-body font-medium text-content-primary">
                      We are still setting the interview times
                    </p>
                    {/* Said plainly, because an empty page otherwise reads
                        as "they changed their mind about me". */}
                    <p className="mx-auto mt-2 max-w-[46ch] text-body-sm text-content-secondary">
                      Your application is through and we do want to speak to
                      you. Come back to this link in a day or so, or reply to
                      our email and we will arrange something directly.
                    </p>
                  </div>
                ) : (
                  <SlotCalendar slots={data.slots} busy={busy} onChoose={book} />
                )}
              </div>

              {data.slots.length > 0 && (
                <p className="mt-6 text-body-sm text-content-tertiary">
                  Times are offered to everyone we are speaking to, so they go
                  quickly. If none of these work, reply to our email.
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

function longTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function minutesBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}
