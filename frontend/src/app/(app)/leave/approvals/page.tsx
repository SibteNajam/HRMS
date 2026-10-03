'use client';

import { toast } from 'sonner';
import { ArrowDownNarrowWide, Inbox, ShieldCheck, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { CardListSkeleton } from '@/components/ui/loading';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useGetLeaveRecommendationsMutation,
  useGetPendingLeaveRequestsQuery,
} from '@/store/api/endpoints/leaveApi';
import { useAppSelector } from '@/store/hooks';
import { ApprovalCard } from './ApprovalCard';
import { QueueSummary } from './QueueSummary';
import { agreementOf, queueOrder, summarise, type Verdict } from './verdict';

export default function ApprovalsPage() {
  const me = useAppSelector((s) => s.auth.user)!;
  const [analyse, { isLoading: analysing }] = useGetLeaveRecommendationsMutation();

  /**
   * @param force re-analyse requests whose stored advice is still valid.
   *
   * Nothing is held in component state. The advice lives against the
   * request, so the queue is refetched and it arrives with everything else
   * — which is why navigating away and back no longer loses it, and why a
   * request already analysed on the same facts costs nothing to show again.
   */
  async function runAnalysis(force = false) {
    try {
      const produced = await analyse({ force }).unwrap();
      toast.success(
        produced.length ? `Analysed ${produced.length} request${produced.length === 1 ? '' : 's'}` : 'Nothing to analyse',
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const { data, isLoading, isError } = useGetPendingLeaveRequestsQuery(
    { limit: 50 },
    // Tag invalidation cannot cross browsers — a request submitted by someone
    // else reaches this screen only because we poll for it.
    { pollingInterval: 15_000, skipPollingIfUnfocused: true },
  );

  // Verdict, agreement and sort key for each request, computed once.
  // The comparator ran summarise() on both sides of every comparison before
  // this, which is n log n evaluations of the same handful of answers.
  const assessed = (data?.data ?? []).map((request) => {
    const verdict: Verdict = request.decision
      ? summarise(request.decision).verdict
      : 'clear';
    const recommendation = request.recommendation ?? null;
    return {
      request,
      recommendation,
      verdict,
      agreement: agreementOf(verdict, recommendation),
      order: queueOrder(verdict, recommendation),
    };
  });

  // What cannot go through first, then what needs thought, then what is
  // ready — and within each group, the ones where the assistant disagrees
  // with the flags, because those are the ones worth reading.
  const ordered = [...assessed].sort((a, b) => a.order - b.order);

  // Advice that exists and still matches the facts. Anything else is work
  // the assistant has not done yet, or has done on figures that have moved.
  const analysed = assessed.filter((a) => a.recommendation).length;
  const needing = assessed.filter(
    (a) => !a.recommendation || a.recommendation.stale,
  ).length;

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
              // Nothing left to analyse means the only useful action is a
              // deliberate second opinion, so the button forces one rather
              // than appearing to do nothing.
              onClick={() => runAnalysis(needing === 0)}
            >
              {needing === 0 && analysed > 0
                ? 'Re-analyse queue'
                : analysed > 0
                  ? `Analyse ${needing} more`
                  : 'Analyse with AI'}
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

      {!isLoading && !!data?.data.length && (
        <QueueSummary rows={assessed} analysed={analysed > 0} />
      )}

      {/* Said once, here, rather than repeated on every card. */}
      {analysed > 0 && !analysing && (
        <p className="mb-5 flex items-center gap-2 text-body-sm text-content-tertiary">
          <Sparkles size={14} strokeWidth={2} aria-hidden />
          Advice only — the decision and the record are yours. Figures on each
          card are calculated by the system, not by the assistant.
        </p>
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
          {data.data.length > 1 && (
            <p className="flex items-center gap-1.5 text-caption text-content-tertiary">
              <ArrowDownNarrowWide size={13} strokeWidth={2} aria-hidden />
              Sorted by what needs attention first
            </p>
          )}
          {ordered.map((row) => (
            <ApprovalCard
              key={row.request.id}
              request={row.request}
              recommendation={row.recommendation}
            />
          ))}
        </div>
      )}
    </>
  );
}
