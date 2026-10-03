'use client';

import { useState } from 'react';
import { CircleCheck, CircleMinus, CircleX, Clock, Inbox, Search, Bot } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { formatDate, formatRelative } from '@/lib/format';
import { useGetAllLeaveRequestsQuery, useGetLeaveTypesQuery } from '@/store/api/endpoints/leaveApi';
import type { LeaveRequestStatus } from '@/types';

const STATUS = {
  PENDING:   { tone: 'warning' as const, icon: Clock,       label: 'Pending' },
  APPROVED:  { tone: 'success' as const, icon: CircleCheck, label: 'Approved' },
  REJECTED:  { tone: 'danger'  as const, icon: CircleX,     label: 'Rejected' },
  CANCELLED: { tone: 'neutral' as const, icon: CircleMinus, label: 'Cancelled' },
};

export default function AllRequestsPage() {
  const [status, setStatus] = useState<'' | LeaveRequestStatus>('');
  const [typeId, setTypeId] = useState('');

  const { data: types } = useGetLeaveTypesQuery();
  const { data, isLoading } = useGetAllLeaveRequestsQuery({
    status: status || undefined,
    leaveTypeId: typeId ? Number(typeId) : undefined,
    limit: 100,
  });

  return (
    <>
      <PageHeader
        title="All leave requests"
        subtitle="Every request across the organisation, whatever its outcome."
      />

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        <div className="flex flex-wrap items-start gap-3 border-b border-line-subtle p-4">
          <div className="w-[180px]">
            <Select value={status} onChange={(e) => setStatus(e.target.value as never)} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
          <div className="w-[180px]">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Filter by leave type">
              <option value="">All types</option>
              {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <p className="ml-auto self-center text-body-sm text-content-secondary">
            {data ? `${data.meta.total} request${data.meta.total === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : !data?.data.length ? (
          <div className="p-16 text-center">
            <Inbox size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">No requests match</h3>
            <p className="mt-1.5 text-body-sm text-content-secondary">Try clearing the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-sunken">
                  {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Decided by'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => {
                  const name = `${r.employee.firstName} ${r.employee.lastName}`;
                  const meta = STATUS[r.status];
                  const reviewer = r.reviewer?.employee
                    ? `${r.reviewer.employee.firstName} ${r.reviewer.employee.lastName}`
                    : r.reviewer?.email ?? null;
                  return (
                    <tr key={r.id} className="border-t border-line-subtle transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="truncate text-body font-medium text-content-primary">{name}</p>
                            <p className="truncate text-caption text-content-tertiary">
                              {r.employee.department.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-body text-content-primary">{r.leaveType.name}</td>
                      <td className="px-4 py-3 text-body text-content-primary">
                        {formatDate(r.startDate)} – {formatDate(r.endDate)}
                      </td>
                      <td className="tabular px-4 py-3 text-body text-content-primary">{r.days}</td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                        {r.status === 'REJECTED' && r.reviewNote && (
                          <p className="mt-1 max-w-[260px] text-caption leading-snug text-content-secondary">
                            “{r.reviewNote}”
                          </p>
                        )}
                        {/* Nothing goes through unexplained: an automatic
                            approval shows the figures it was decided on. */}
                        {r.autoApproved && r.autoDecisionNote && (
                          <p className="mt-1 max-w-[320px] text-caption leading-snug text-content-tertiary">
                            {r.autoDecisionNote}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.autoApproved ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-body-sm font-medium text-brand">
                              <Bot size={13} strokeWidth={2} aria-hidden />
                              Automatic
                            </span>
                            <p className="text-caption text-content-tertiary">
                              {r.reviewedAt ? formatRelative(r.reviewedAt) : ''}
                            </p>
                          </>
                        ) : reviewer ? (
                          <>
                            <p className="text-body-sm text-content-primary">{reviewer}</p>
                            <p className="text-caption text-content-tertiary">
                              {r.reviewedAt ? formatRelative(r.reviewedAt) : ''}
                            </p>
                          </>
                        ) : (
                          <span className="text-body-sm text-content-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
