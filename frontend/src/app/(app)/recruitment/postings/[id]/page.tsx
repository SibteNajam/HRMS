'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { CardListSkeleton } from '@/components/ui/loading';
import { useGetPostingQuery } from '@/store/api/endpoints/recruitmentApi';
import { AdvertPreview } from './AdvertPreview';

export default function PostingSlotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const postingId = Number(id);
  const { data: posting, isLoading } = useGetPostingQuery(postingId);
  if (isLoading) return <CardListSkeleton count={2} />;
  if (!posting) return null;

  const upcoming = posting.slots.filter((s) => new Date(s.startsAt) > new Date());

  return (
    <>
      <Link
        href="/recruitment"
        className="mb-4 inline-flex items-center gap-1.5 text-body-sm text-content-secondary transition-colors hover:text-content-primary"
      >
        <ArrowLeft size={15} /> All postings
      </Link>

      <PageHeader
        title={posting.title}
        subtitle={`${posting.code} · the advert below and the screening criteria come from the same place.`}
      />

      <AdvertPreview advert={posting.advert} code={posting.code} />

      <h2 className="font-display text-h3 text-content-primary">
        Interview times{' '}
        <span className="tabular text-content-tertiary">({upcoming.length})</span>
      </h2>
      <p className="mb-4 max-w-[70ch] text-body-sm text-content-secondary">
        Generated from the interview window on this posting — change it
        there and these rebuild. A time somebody has already booked is
        never moved.
      </p>

      {upcoming.length === 0 ? (
        <p className="rounded-xl border border-line-subtle bg-surface-raised p-10 text-center text-body-sm text-content-secondary">
          No interview window set yet. Edit the posting to choose the dates
          and hours, and the times appear here. Shortlisted candidates
          cannot book until they do.
        </p>
      ) : (
        <ul className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((s) => {
            const taken = Boolean(s.interview);
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg border px-3.5 py-3',
                  taken
                    ? 'border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]'
                    : 'border-line-subtle bg-surface-raised',
                )}
              >
                <div className="min-w-0">
                  <p className={cn('flex items-center gap-1.5 text-body font-medium', taken ? 'text-[var(--color-primary)]' : 'text-content-primary')}>
                    <Clock size={14} strokeWidth={2} aria-hidden />
                    {new Intl.DateTimeFormat('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    }).format(new Date(s.startsAt))}
                  </p>
                  <p className="text-caption text-content-tertiary">
                    {taken ? 'Booked' : 'Available'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
