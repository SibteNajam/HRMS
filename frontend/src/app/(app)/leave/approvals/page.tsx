'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  CircleAlert, CircleCheck, Inbox, ShieldCheck, Sparkles, TriangleAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { CardListSkeleton } from '@/components/ui/loading';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useGetLeaveRecommendationsMutation,
  useGetPendingLeaveRequestsQuery,
  type LeaveRecommendation,
} from '@/store/api/endpoints/leaveApi';
import { useAppSelector } from '@/store/hooks';
import { ApprovalCard } from './ApprovalCard';
import { summarise } from './verdict';

export default function ApprovalsPage() {
  const me = useAppSelector((s) => s.auth.user)!;
  const [recommendations, setRecommendations] = useState<LeaveRecommendation[]>([]);
  const [analyse, { isLoading: analysing }] = useGetLeaveRecommendationsMutation();

  // One call for the whole queue rather than one per card — the free tier is
  // capped on tokens per minute, and twenty cards would be twenty round trips.
  async function runAnalysis() {
    try {
      setRecommendations(await analyse().unwrap());
      toast.success('Queue analysed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const byRequest = new Map(recommendations.map((r) => [r.requestId, r]));

  const { data, isLoading, isError } = useGetPendingLeaveRequestsQuery(
    { limit: 50 },
    // Tag invalidation cannot cross browsers — a request submitted by someone
    // else reaches this screen only because we poll for it.
    { pollingInterval: 15_000, skipPollingIfUnfocused: true },
  );

  const scope =
    me.role === 'ADMIN'
      ? 'Requests from employees, HR and administrators.'
      : 'Requests from employees. HR and administrator leave is approved by an administrator.';

  return (
    <>
      <PageHeader
        title="Leave approvals"
        subtitle={isLoading ? 'Loading…' : scope}
        actions={
          !isLoading && !!data?.data.length ? (
            <Button
              variant="primary"
              icon={Sparkles}
              loading={analysing}
              onClick={runAnalysis}
            >
              {recommendations.length ? 'Re-analyse queue' : 'Analyse with AI'}
            </Button>
          ) : undefined
        }
      />

      {analysing && (
        <div className="mb-5 rounded-xl border border-line-subtle bg-surface-sunken p-4 text-body-sm text-content-secondary">
          Reading each request against balance, attendance, team coverage and
          history…
        </div>
      )}

      {!!recommendations.length && !analysing && (
        <div className="stagger mb-5 grid gap-3 sm:grid-cols-3">
          {([
            ['APPROVE', 'Recommends approving', 'success'],
            ['REVIEW', 'Wants your judgement', 'warning'],
            ['REJECT', 'Recommends rejecting', 'danger'],
          ] as const).map(([verdict, label, tone]) => {
            const n = recommendations.filter((r) => r.verdict === verdict).length;
            return (
              <div
                key={verdict}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 border-[color-mix(in_srgb,var(--${tone})_28%,transparent)] bg-[color-mix(in_srgb,var(--${tone})_8%,transparent)] text-${tone}`}
              >
                <Sparkles size={18} strokeWidth={2} aria-hidden />
                <p className="tabular font-display text-h2 font-bold">{n}</p>
                <p className="text-body-sm font-medium opacity-90">{label}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* The shape of the queue before a single card is read: how many are
          fine, how many need a look, how many cannot go through. */}
      {!isLoading && !!data?.data.length && (
        <div className="stagger mb-5 grid gap-3 sm:grid-cols-3">
          {(() => {
            const v = data.data.map((r) =>
              r.decision ? summarise(r.decision).verdict : 'clear',
            );
            const tiles = [
              { k: 'clear',   n: v.filter((x) => x === 'clear').length,
                label: 'Ready to approve', icon: CircleCheck,
                cls: 'border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] text-success' },
              { k: 'check',   n: v.filter((x) => x === 'check').length,
                label: 'Need a look', icon: TriangleAlert,
                cls: 'border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] text-warning' },
              { k: 'blocked', n: v.filter((x) => x === 'blocked').length,
                label: 'Over balance', icon: CircleAlert,
                cls: 'border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-danger' },
            ];
            return tiles.map((t) => (
              <div key={t.k} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${t.cls}`}>
                <t.icon size={20} strokeWidth={2} aria-hidden />
                <p className="tabular font-display text-h2 font-bold">{t.n}</p>
                <p className="text-body-sm font-medium opacity-90">{t.label}</p>
              </div>
            ));
          })()}
        </div>
      )}

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : isError ? (
        <div className="rounded-xl border border-line-subtle bg-surface-raised p-16 text-center">
          <p className="text-body text-danger">Could not load the queue.</p>
        </div>
      ) : !data?.data.length ? (
        <div className="animate-fade-up rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <Inbox size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">
            Nothing waiting
          </h3>
          <p className="mx-auto mt-1.5 max-w-[380px] text-body-sm text-content-secondary">
            When someone submits a leave request you can approve, it appears
            here within a few seconds.
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-content-tertiary">
            <ShieldCheck size={13} aria-hidden />
            {scope}
          </p>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-4">
          {data.data.map((request) => (
            <ApprovalCard
              key={request.id}
              request={request}
              recommendation={byRequest.get(request.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
