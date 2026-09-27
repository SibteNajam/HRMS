'use client';

import { Inbox, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { CardListSkeleton } from '@/components/ui/loading';
import { useGetPendingLeaveRequestsQuery } from '@/store/api/endpoints/leaveApi';
import { useAppSelector } from '@/store/hooks';
import { ApprovalCard } from './ApprovalCard';

export default function ApprovalsPage() {
  const me = useAppSelector((s) => s.auth.user)!;

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
        subtitle={
          isLoading
            ? 'Loading…'
            : `${data?.meta.total ?? 0} awaiting your decision · ${scope}`
        }
      />

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
            <ApprovalCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </>
  );
}
