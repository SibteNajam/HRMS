'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Check, Quote, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate, formatRelative } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useReviewLeaveRequestMutation } from '@/store/api/endpoints/leaveApi';
import type { LeaveRequest } from '@/types';
import { DecisionPanel } from './DecisionPanel';
import { RejectDialog } from './RejectDialog';

export function ApprovalCard({ request }: { request: LeaveRequest }) {
  const [review, { isLoading }] = useReviewLeaveRequestMutation();
  const [rejecting, setRejecting] = useState(false);

  const name = `${request.employee.firstName} ${request.employee.lastName}`;
  const requesterRole = request.employee.user?.role ?? 'EMPLOYEE';
  const elevated = requesterRole === 'HR' || requesterRole === 'ADMIN';

  async function approve() {
    try {
      await review({ id: request.id, decision: 'APPROVED' }).unwrap();
      toast.success(`Approved ${name}'s leave`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function reject(note: string) {
    try {
      await review({ id: request.id, decision: 'REJECTED', note }).unwrap();
      toast.success(`Rejected ${name}'s leave`, { description: 'They have been notified.' });
      setRejecting(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const blocked = (request.decision?.balance.afterApproval ?? 0) < 0;

  return (
    <article className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <header className="flex items-start gap-3.5">
        <Avatar name={name} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-h3 text-content-primary">{name}</h3>
            {elevated && (
              <Badge tone="brand" icon={ShieldCheck} small>
                {requesterRole}
              </Badge>
            )}
          </div>
          <p className="text-body-sm text-content-secondary">
            {request.employee.designation} · {request.employee.department.name} ·{' '}
            {request.employee.employeeCode}
          </p>
        </div>
        <span className="shrink-0 text-caption text-content-tertiary">
          {formatRelative(request.createdAt)}
        </span>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-surface-sunken px-4 py-3">
        <Badge tone="info" icon={CalendarDays}>{request.leaveType.name}</Badge>
        <p className="text-body font-medium text-content-primary">
          {formatDate(request.startDate)} – {formatDate(request.endDate)}
        </p>
        <p className="tabular text-body-sm text-content-secondary">
          {request.days} working day{Number(request.days) === 1 ? '' : 's'}
        </p>
      </div>

      <div className="mt-3 flex gap-2.5">
        <Quote size={15} className="mt-0.5 shrink-0 text-content-tertiary" aria-hidden />
        <p className="text-body leading-relaxed text-content-primary">{request.reason}</p>
      </div>

      {request.decision && <DecisionPanel ctx={request.decision} />}

      <footer className="mt-4 flex items-center justify-end gap-2">
        {blocked && (
          <p className="mr-auto text-body-sm text-danger">
            Approval will be refused — this exceeds their balance.
          </p>
        )}
        <Button
          variant="secondary"
          icon={X}
          disabled={isLoading}
          onClick={() => setRejecting(true)}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          icon={Check}
          loading={isLoading}
          disabled={blocked}
          onClick={approve}
        >
          Approve
        </Button>
      </footer>

      <RejectDialog
        open={rejecting}
        name={name}
        loading={isLoading}
        onConfirm={reject}
        onCancel={() => setRejecting(false)}
      />
    </article>
  );
}
