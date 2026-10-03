'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Quote, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatRelative } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useReviewLeaveRequestMutation } from '@/store/api/endpoints/leaveApi';
import type { LeaveRequest } from '@/types';
import type { StoredRecommendation } from '@/types';
import { DecisionPanel } from './DecisionPanel';
import { RejectDialog } from './RejectDialog';
import { summarise, type Verdict } from './verdict';

/** Day name included — coverage is easier to judge with weekdays visible. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(d);
}

const ACCENT: Record<Verdict, string> = {
  blocked: 'before:bg-danger',
  check: 'before:bg-warning',
  clear: 'before:bg-success',
};

export function ApprovalCard({
  request, recommendation,
}: {
  request: LeaveRequest;
  recommendation?: StoredRecommendation | null;
}) {
  const [review, { isLoading }] = useReviewLeaveRequestMutation();
  const [rejecting, setRejecting] = useState(false);

  const name = `${request.employee.firstName} ${request.employee.lastName}`;
  const requesterRole = request.employee.user?.role ?? 'EMPLOYEE';
  const elevated = requesterRole === 'HR' || requesterRole === 'ADMIN';

  const summary = request.decision ? summarise(request.decision) : null;
  const verdict = summary?.verdict ?? 'clear';
  const blocked = verdict === 'blocked';

  async function approve() {
    try {
      // The AI verdict rides along so the audit trail records whether the
      // human agreed with it or went the other way.
      await review({
        id: request.id,
        decision: 'APPROVED',
        aiVerdict: recommendation?.verdict,
      }).unwrap();
      toast.success(`Approved ${name}'s leave`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function reject(note: string) {
    try {
      await review({
        id: request.id, decision: 'REJECTED', note,
        aiVerdict: recommendation?.verdict,
      }).unwrap();
      toast.success(`Rejected ${name}'s leave`, { description: 'They have been notified.' });
      setRejecting(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm',
        // A 3px severity rail down the left edge, so a queue of twenty is
        // scannable without reading a word.
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
        ACCENT[verdict],
      )}
    >
      <div className="p-5 pl-6">
        <header className="flex items-start gap-3.5">
          <Avatar name={name} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-h3 text-content-primary">{name}</h3>
              {elevated && (
                <Badge tone="brand" icon={ShieldCheck} small>{requesterRole}</Badge>
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

        {/* The three facts that define the request, weighted so the day count
            reads first — it is what decides whether cover is needed. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-sunken px-4 py-3">
          <p className="tabular font-display text-h2 font-bold text-content-primary">
            {request.days}
            <span className="ml-1 text-body font-medium text-content-secondary">
              working day{Number(request.days) === 1 ? '' : 's'}
            </span>
          </p>
          <span className="h-5 w-px bg-line-default" aria-hidden />
          <p className="flex items-center gap-1.5 text-body font-medium text-content-primary">
            {dayLabel(request.startDate)}
            <ArrowRight size={14} className="text-content-tertiary" aria-hidden />
            {dayLabel(request.endDate)}
          </p>
          <Badge tone="info" className="ml-auto">{request.leaveType.name}</Badge>
        </div>

        <div className="mt-3 flex gap-2.5">
          <Quote size={14} className="mt-1 shrink-0 text-content-tertiary" aria-hidden />
          <p className="text-body leading-relaxed text-content-primary">{request.reason}</p>
        </div>

        {/* One conclusion, not two. The rules engine and the assistant
            share a single block so a reviewer reads one verdict rather than
            two panels that usually agree. */}
        {request.decision && (
          <DecisionPanel ctx={request.decision} rec={recommendation} />
        )}

        <footer className="mt-4 flex items-center justify-end gap-2">
          <Button variant="secondary" icon={X} disabled={isLoading} onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Button
            variant="primary"
            icon={Check}
            loading={isLoading}
            disabled={blocked}
            title={blocked ? 'This exceeds their balance and will be refused' : undefined}
            onClick={approve}
          >
            Approve
          </Button>
        </footer>
      </div>

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
