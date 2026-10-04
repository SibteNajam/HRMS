'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck, Mail, RefreshCw, Sparkles, Upload, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { CardListSkeleton } from '@/components/ui/loading';
import { formatRelative } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useDecideApplicationMutation, useGetApplicationsQuery, useGetPostingsQuery,
  useGetTopApplicationsQuery, useScreenApplicationMutation, useUploadCvMutation,
  type Application,
} from '@/store/api/endpoints/recruitmentApi';
import { ScoreBadge } from '../ScoreBadge';
import { STATUS } from '../statusMeta';
import { DecideDialog } from './DecideDialog';

type Tab = 'top' | 'waiting' | 'all';

export default function CandidatesPage() {
  const { data: applications, isLoading } = useGetApplicationsQuery();
  const { data: top } = useGetTopApplicationsQuery(15);
  const { data: postings } = useGetPostingsQuery();
  const [upload, { isLoading: uploading }] = useUploadCvMutation();
  const [deciding, setDeciding] = useState<Application | null>(null);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('top');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const postingId = Number(filter);
    if (!file) return;
    if (!postingId) {
      toast.error('Pick which role this CV is for first');
      e.target.value = '';
      return;
    }
    try {
      const result = await upload({ postingId, file }).unwrap();
      toast.success(
        result.score === null
          ? `${result.candidateName} added — needs a look`
          : `${result.candidateName} scored ${result.score}`,
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      e.target.value = '';
    }
  }

  const byRole = (rows: Application[]) =>
    rows.filter((a) => !filter || a.posting?.id === Number(filter));

  /**
   * Invited but has not picked a time.
   *
   * The one group at risk of being forgotten: the system has done its
   * part and the candidate has not replied, so nothing prompts anybody to
   * look. A tab is what stops them sitting there for a fortnight.
   */
  const waiting = byRole(
    (applications ?? []).filter((a) => a.status === 'SHORTLISTED' && !a.interview),
  );

  const TABS: { key: Tab; label: string; count: number; help: string }[] = [
    {
      key: 'top', label: 'Best matches', count: byRole(top ?? []).length,
      help: 'Scored and ranked — fit first, then whoever asks for less.',
    },
    {
      key: 'waiting', label: 'Awaiting booking', count: waiting.length,
      help: 'Invited, but have not chosen an interview time yet.',
    },
    {
      key: 'all', label: 'Everyone', count: byRole(applications ?? []).length,
      help: 'Every application, including those below the bar.',
    },
  ];

  const rows =
    tab === 'top' ? byRole(top ?? [])
    : tab === 'waiting' ? waiting
    : byRole(applications ?? []);

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle="Scored against the posting. The score is advice — the decision is yours."
        actions={
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={onFile} />
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-body-sm font-semibold text-white',
                'transition-opacity hover:opacity-90',
                uploading && 'pointer-events-none opacity-60',
              )}
            >
              <Upload size={15} strokeWidth={2} />
              {uploading ? 'Reading CV…' : 'Upload a CV'}
            </span>
          </label>
        }
      />

      <div className="mb-4 max-w-[320px]">
        <Select
          label="Role"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {postings?.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.title}</option>
          ))}
        </Select>
      </div>

      <div role="tablist" className="mb-1.5 flex flex-wrap gap-1 border-b border-line-subtle">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-body-sm font-medium transition-colors',
              tab === t.key
                ? 'border-[var(--color-primary)] text-content-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary',
            )}
          >
            {t.label}
            <span
              className={cn(
                'tabular rounded-full px-1.5 py-0.5 text-caption font-semibold',
                tab === t.key ? 'bg-[var(--color-primary-solid)] text-white' : 'bg-surface-sunken text-content-tertiary',
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>
      <p className="mb-5 text-caption text-content-tertiary">{active.help}</p>

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : !rows.length ? (
        <div className="animate-fade-up rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <Users size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">
            {tab === 'waiting' ? 'Nobody is waiting' : 'No candidates yet'}
          </h3>
          <p className="mx-auto mt-1.5 max-w-[420px] text-body-sm text-content-secondary">
            {tab === 'waiting'
              ? 'Everybody invited has picked an interview time.'
              : 'Candidates apply through the careers page. You can also upload a CV above against a role.'}
          </p>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-3">
          {rows.map((a, i) => (
            <CandidateCard
              key={a.id}
              application={a}
              rank={tab === 'top' ? i + 1 : undefined}
              onDecide={() => setDeciding(a)}
            />
          ))}
        </div>
      )}

      {deciding && (
        <DecideDialog application={deciding} onClose={() => setDeciding(null)} />
      )}
    </>
  );
}

function CandidateCard({
  application: a, rank, onDecide,
}: {
  application: Application;
  /** Position on the shortlist. Absent on the other tabs. */
  rank?: number;
  onDecide: () => void;
}) {
  const [rescreen, { isLoading: screening }] = useScreenApplicationMutation();
  const meta = STATUS[a.status];
  const Glyph = meta.icon;

  async function screen() {
    try {
      const r = await rescreen(a.id).unwrap();
      toast.success(r.score === null ? 'Still could not score it' : `Scored ${r.score}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <article className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-3.5">
        {rank !== undefined && (
          <span className="tabular mt-1 w-6 shrink-0 text-center font-display text-h3 font-bold text-content-tertiary">
            {rank}
          </span>
        )}
        <Avatar name={a.candidateName} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="font-display text-h3 text-content-primary">{a.candidateName}</h3>
            <span className={cn('inline-flex items-center gap-1 text-body-sm font-medium', meta.tone)}>
              <Glyph size={13} strokeWidth={2} aria-hidden />
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-body-sm text-content-secondary">
            <span className="flex items-center gap-1">
              <Mail size={12} aria-hidden />{a.candidateEmail || 'no email found'}
            </span>
            {a.posting && <span>{a.posting.code} · {a.posting.title}</span>}
            <span className="text-content-tertiary">{formatRelative(a.receivedAt)}</span>
          </p>
        </div>

        <ScoreBadge score={a.score} threshold={a.posting?.shortlistThreshold ?? 70} />
      </div>

      {a.scoreReason && (
        <p className="mt-3 text-body leading-snug text-content-primary">{a.scoreReason}</p>
      )}

      {/* Why it was parked, or the reason a person gave. Both matter more
          than the score and neither should need a click. */}
      {a.decisionNote && (
        <p className="mt-2.5 rounded-md bg-surface-sunken px-2.5 py-2 text-body-sm text-content-secondary">
          {a.decisionNote}
        </p>
      )}

      {(a.matchedSkills?.length || a.missingSkills?.length) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.matchedSkills?.map((s) => (
            <span key={s} className="rounded-md bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-1 text-caption text-success">
              {s}
            </span>
          ))}
          {a.missingSkills?.map((s) => (
            <span key={s} className="rounded-md bg-surface-sunken px-2 py-1 text-caption text-content-tertiary line-through decoration-1">
              {s}
            </span>
          ))}
        </div>
      )}

      {a.interview && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] px-3 py-2 text-body-sm text-[var(--color-primary)]">
          <CalendarCheck size={15} strokeWidth={2} aria-hidden />
          Interview{' '}
          {new Intl.DateTimeFormat('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }).format(new Date(a.interview.slot.startsAt))}
        </p>
      )}

      {/* Only a form application has these. An emailed CV tells us none
          of it, which is the argument for the careers page. */}
      {(a.statedYearsExperience || a.expectedSalary) && (
        <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2 rounded-lg bg-surface-sunken px-3.5 py-2.5">
          {a.statedYearsExperience && (
            <Detail
              label="They say"
              value={`${a.statedYearsExperience} years`}
              // A gap between what somebody claims and what their CV shows
              // is not dishonesty by itself — but it is the thing a
              // reviewer would want to ask about.
              warn={
                a.yearsExperience !== null &&
                Math.abs(Number(a.statedYearsExperience) - Number(a.yearsExperience)) >= 2
              }
            />
          )}
          {a.yearsExperience && (
            <Detail label="CV shows" value={`${a.yearsExperience} years`} />
          )}
          {a.currentSalary && (
            <Detail label="Current" value={money(a.currentSalary)} />
          )}
          {a.expectedSalary && (
            <Detail label="Expects" value={money(a.expectedSalary)} />
          )}
          {a.candidateAddress && <Detail label="Based in" value={a.candidateAddress} />}
        </dl>
      )}

      <footer className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {a.yearsExperience && !a.statedYearsExperience && (
          <span className="mr-auto text-body-sm text-content-tertiary">
            <span className="tabular font-medium text-content-secondary">
              {a.yearsExperience}
            </span>{' '}
            years of relevant experience
          </span>
        )}
        {a.posting && (
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={screening} onClick={screen}>
            Re-score
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={Sparkles} onClick={onDecide}>
          Decide
        </Button>
      </footer>
    </article>
  );
}


function Detail({
  label, value, warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.05em] text-content-tertiary">
        {label}
      </dt>
      <dd
        className={cn(
          'tabular text-body-sm font-medium',
          warn ? 'text-warning' : 'text-content-primary',
        )}
        title={warn ? 'This differs from what the CV evidences' : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

/** "PKR 150,000" — the figure matters, the decimals do not. */
function money(value: string): string {
  return `PKR ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
