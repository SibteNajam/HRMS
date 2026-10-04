'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Briefcase, CalendarOff, Inbox, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CardListSkeleton } from '@/components/ui/loading';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useCheckInboxMutation, useGetPostingsQuery, useGetRecruitmentStatusQuery,
  type JobPosting,
} from '@/store/api/endpoints/recruitmentApi';
import { PostingDialog } from './PostingDialog';

const STATUS = {
  OPEN: { tone: 'success' as const, label: 'Open' },
  DRAFT: { tone: 'neutral' as const, label: 'Draft' },
  CLOSED: { tone: 'neutral' as const, label: 'Closed' },
};

export default function RecruitmentPage() {
  const { data: postings, isLoading } = useGetPostingsQuery();
  const { data: status } = useGetRecruitmentStatusQuery();
  const [checkInbox, { isLoading: checking }] = useCheckInboxMutation();
  const [editing, setEditing] = useState<JobPosting | 'new' | null>(null);

  async function pull() {
    try {
      const r = await checkInbox().unwrap();
      toast.success(
        r.applications > 0
          ? `${r.applications} new application${r.applications === 1 ? '' : 's'}`
          : 'No new CVs in the mailbox',
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Job postings"
        subtitle="Every CV is scored against the description you write here, so write it like a spec."
        actions={
          <div className="flex gap-2">
            {status?.inbox && (
              <Button variant="secondary" icon={Inbox} loading={checking} onClick={pull}>
                Check mailbox
              </Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              New posting
            </Button>
          </div>
        }
      />

      {/* Email intake is optional, and a system that silently is not
          collecting CVs is worse than one that says so. */}
      {status && !status.inbox && (
        <p className="mb-5 flex items-start gap-2 rounded-lg border border-line-subtle bg-surface-sunken px-3.5 py-3 text-body-sm text-content-secondary">
          <Inbox size={15} className="mt-0.5 shrink-0 text-content-tertiary" aria-hidden />
          <span>
            Email intake is off — no mailbox is configured, so CVs sent by
            candidates are not being collected. You can still upload CVs by
            hand from a posting.
          </span>
        </p>
      )}

      {isLoading ? (
        <CardListSkeleton count={2} />
      ) : !postings?.length ? (
        <div className="animate-fade-up rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <Briefcase size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">No postings yet</h3>
          <p className="mx-auto mt-1.5 max-w-[420px] text-body-sm text-content-secondary">
            A posting is what CVs are screened against. Write the description
            as the requirements, not as an advert.
          </p>
        </div>
      ) : (
        <div className="stagger grid gap-4 lg:grid-cols-2">
          {postings.map((p) => (
            <article
              key={p.id}
              className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-h3 text-content-primary">{p.title}</h3>
                    <Badge tone={STATUS[p.status].tone} small>{STATUS[p.status].label}</Badge>
                  </div>
                  <p className="mt-0.5 text-body-sm text-content-secondary">
                    <span className="tabular font-medium">{p.code}</span>
                    {p.department && ` · ${p.department.name}`}
                    {p.minYearsExperience > 0 && ` · ${p.minYearsExperience}+ years`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </div>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {p.requiredSkills.slice(0, 8).map((s) => (
                  <li key={s} className="rounded-md bg-surface-sunken px-2 py-1 text-caption text-content-secondary">
                    {s}
                  </li>
                ))}
                {p.requiredSkills.length > 8 && (
                  <li className="px-1 py-1 text-caption text-content-tertiary">
                    +{p.requiredSkills.length - 8} more
                  </li>
                )}
              </ul>

              {/* An open role with no times is the failure nobody sees:
                  candidates are shortlisted, emailed, click the link and
                  are told there is nothing available — which reads as a
                  change of mind. Said here, before that happens. */}
              {p.status === 'OPEN' && (p._count?.slots ?? 0) === 0 && (
                <p className="mt-3 flex items-start gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2.5 py-2 text-caption text-warning">
                  <CalendarOff size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    No interview times. Anybody shortlisted will be emailed a
                    link to an empty page — set the interview window on this
                    posting.
                  </span>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-subtle pt-3.5 text-body-sm">
                <span className="flex items-center gap-1.5 text-content-secondary">
                  <Users size={14} strokeWidth={2} aria-hidden />
                  <span className="tabular font-medium text-content-primary">
                    {p._count?.applications ?? 0}
                  </span>
                  application{(p._count?.applications ?? 0) === 1 ? '' : 's'}
                </span>
                <span className="text-content-secondary">
                  <span className="tabular font-medium text-content-primary">
                    {p._count?.slots ?? 0}
                  </span>{' '}
                  interview slot{(p._count?.slots ?? 0) === 1 ? '' : 's'}
                </span>
                <span
                  className="tabular ml-auto text-caption text-content-tertiary"
                  title="Candidates at or above this score are invited automatically"
                >
                  Bar: {p.shortlistThreshold}
                </span>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/recruitment/candidates?posting=${p.id}`}
                  className={cn(
                    'flex-1 rounded-lg border border-line-default px-3 py-2 text-center text-body-sm',
                    'font-medium text-content-primary transition-colors hover:bg-surface-hover',
                  )}
                >
                  Candidates
                </Link>
                <Link
                  href={`/recruitment/postings/${p.id}`}
                  className={cn(
                    'flex-1 rounded-lg border border-line-default px-3 py-2 text-center text-body-sm',
                    'font-medium text-content-primary transition-colors hover:bg-surface-hover',
                  )}
                >
                  Interview times
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <PostingDialog
          posting={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
