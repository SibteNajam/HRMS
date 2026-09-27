'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarDays, CalendarPlus, CircleCheck, CircleMinus, CircleX, Clock } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatRowSkeleton } from '@/components/ui/loading';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useCancelLeaveRequestMutation,
  useGetMyLeaveBalanceQuery,
  useGetMyLeaveRequestsQuery,
} from '@/store/api/endpoints/leaveApi';
import type { LeaveRequestStatus } from '@/types';

const STATUS = {
  PENDING:   { tone: 'warning' as const, icon: Clock,       label: 'Pending' },
  APPROVED:  { tone: 'success' as const, icon: CircleCheck, label: 'Approved' },
  REJECTED:  { tone: 'danger'  as const, icon: CircleX,     label: 'Rejected' },
  CANCELLED: { tone: 'neutral' as const, icon: CircleMinus, label: 'Cancelled' },
} satisfies Record<LeaveRequestStatus, unknown>;

export default function MyLeavePage() {
  const { data: balance, isLoading: loadingBalance } = useGetMyLeaveBalanceQuery();
  const { data: requests, isLoading } = useGetMyLeaveRequestsQuery(
    { limit: 50 },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  );
  const [cancel, { isLoading: cancelling }] = useCancelLeaveRequestMutation();

  async function onCancel(id: number) {
    try {
      await cancel(id).unwrap();
      toast.success('Request cancelled');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="My leave"
        subtitle="Your balance for this year and every request you have made."
        actions={
          <Link href="/leave/new">
            <Button variant="primary" icon={CalendarPlus}>Request leave</Button>
          </Link>
        }
      />

      {loadingBalance ? (
        <StatRowSkeleton count={4} />
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {balance?.map((b) => {
            const pct = b.allocated ? (b.used / b.allocated) * 100 : 0;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                    {b.leaveType.name}
                  </p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-selected">
                    <CalendarDays size={18} strokeWidth={1.75} className="text-content-selected" />
                  </span>
                </div>
                <p className="tabular mt-3 font-display text-display-sm text-content-primary">
                  {b.allocated > 0 ? b.remaining : '∞'}
                </p>
                <p className="text-body-sm text-content-secondary">
                  {b.allocated > 0 ? `of ${b.allocated} days remaining` : 'Unpaid — no quota'}
                </p>
                {b.allocated > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        {isLoading ? (
          <TableSkeleton rows={5} columns={5} avatar={false} />
        ) : !requests?.data.length ? (
          <div className="p-16 text-center">
            <CalendarDays size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">No requests yet</h3>
            <p className="mt-1.5 text-body-sm text-content-secondary">
              Requests you submit will appear here with their status.
            </p>
            <Link href="/leave/new" className="mt-5 inline-block">
              <Button variant="primary" icon={CalendarPlus}>Request leave</Button>
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-surface-sunken">
                {['Type', 'Dates', 'Days', 'Status', ''].map((h, i) => (
                  <th key={h || i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r) => {
                const meta = STATUS[r.status];
                return (
                  <tr key={r.id} className="border-t border-line-subtle transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3 text-body text-content-primary">{r.leaveType.name}</td>
                    <td className="px-4 py-3 text-body text-content-primary">
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </td>
                    <td className="tabular px-4 py-3 text-body text-content-primary">{r.days}</td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                      {/* A rejected employee must see why without clicking. */}
                      {r.status === 'REJECTED' && r.reviewNote && (
                        <p className="mt-1.5 max-w-[340px] text-caption leading-snug text-content-secondary">
                          “{r.reviewNote}”
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'PENDING' && (
                        <Button size="sm" variant="ghost" loading={cancelling} onClick={() => onCancel(r.id)}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
