'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CircleAlert, CircleCheck, Info, Lock, PenLine, RefreshCw, ShieldCheck,
  Trash2, TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useAppSelector } from '@/store/hooks';
import {
  monthLabel, useDeleteRunMutation, useFinaliseRunMutation, useGetRunQuery,
  type RunPayslip,
} from '@/store/api/endpoints/payrollApi';
import { AdjustDialog } from './AdjustDialog';

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const runId = Number(id);
  const router = useRouter();
  const me = useAppSelector((s) => s.auth.user)!;
  const isAdmin = me.role === 'ADMIN';

  const { data: run, isLoading } = useGetRunQuery(runId);
  const [finalise, { isLoading: finalising }] = useFinaliseRunMutation();
  const [remove, { isLoading: removing }] = useDeleteRunMutation();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<RunPayslip | null>(null);

  const isDraft = run?.status === 'DRAFT';
  // Finalising these would issue a payslip for nothing and lock it as a
  // financial record. The fix is one screen away, so say so rather than
  // letting it through.
  const unsetSalary = (run?.payslips ?? []).filter((p) =>
    p.flags.some((f) => f.code === 'NO_SALARY'),
  );

  async function doFinalise() {
    try {
      await finalise(runId).unwrap();
      toast.success('Payroll finalised', {
        description: 'Payslips issued, dues recovered and everyone notified.',
      });
      setConfirming(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirming(false);
    }
  }

  async function doDelete() {
    try {
      await remove(runId).unwrap();
      toast.success('Draft deleted');
      router.push('/payroll/runs');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setDeleting(false);
    }
  }

  if (isLoading || !run) {
    return (
      <>
        <PageHeader title="Payroll run" subtitle="Loading…" />
        <TableSkeleton rows={8} columns={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={monthLabel(run.month, run.year)}
        subtitle={
          isDraft
            ? `${run.payslips.length} draft payslips. Nothing is paid until this is finalised.`
            : `Finalised · ${run.payslips.length} payslips issued`
        }
        actions={
          isDraft ? (
            <>
              {isAdmin && (
                <Button variant="ghost" icon={Trash2} className="text-danger" onClick={() => setDeleting(true)}>
                  Delete draft
                </Button>
              )}
              <Button
                variant="primary"
                icon={isAdmin ? ShieldCheck : Lock}
                disabled={!isAdmin || unsetSalary.length > 0}
                loading={finalising}
                onClick={() => setConfirming(true)}
                title={
                  !isAdmin
                    ? 'Only an administrator can finalise payroll'
                    : unsetSalary.length > 0
                      ? 'Set a salary for everyone in this run first'
                      : undefined
                }
              >
                {isAdmin ? 'Finalise payroll' : 'Admin approval required'}
              </Button>
            </>
          ) : (
            <Badge tone="success" icon={CircleCheck}>Finalised</Badge>
          )
        }
      />

      {/* Totals across the top — the number the business cares about. */}
      <div className="stagger mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Total label="Total net pay" value={run.totals.net} big />
        <Total label="Gross" value={run.totals.gross} />
        <Total label="Deductions" value={run.totals.deductions} />
        <Total label="Dues recovered" value={run.totals.duesRecovered} />
      </div>

      {unsetSalary.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-4">
          <CircleAlert size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-danger">
              {unsetSalary.length} employee{unsetSalary.length === 1 ? ' has' : 's have'} no salary set
            </p>
            <p className="mt-0.5 text-body-sm text-content-secondary">
              {unsetSalary.map((p) => `${p.employee.firstName} ${p.employee.lastName}`).join(', ')}
              {' — '}accounts created by self sign-up start with no salary. Set
              one under Payroll → Salary Structure, then delete this draft and
              recalculate.
            </p>
            <Link
              href="/payroll/structure"
              className="mt-2 inline-block text-body-sm font-medium text-[var(--color-primary)] underline-offset-4 hover:underline"
            >
              Open Salary Structure →
            </Link>
          </div>
        </div>
      )}

      {run.payslips.some((p) => p.proRata) && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-line-subtle bg-surface-sunken p-4">
          <Info size={17} strokeWidth={2} className="mt-0.5 shrink-0 text-info" aria-hidden />
          <p className="text-body-sm text-content-secondary">
            <span className="font-medium text-content-primary">
              {run.payslips.filter((p) => p.proRata).length} payslip
              {run.payslips.filter((p) => p.proRata).length === 1 ? ' is' : 's are'} pro-rated.
            </span>{' '}
            These people joined partway through the month, so they are paid for
            the working days they were employed rather than the full month.
          </p>
        </div>
      )}

      {/* Above the anomalies: a stale draft makes every figure below it
          suspect, so it is the first thing to read. */}
      {run.staleness && (
        <div className="mb-5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-4">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <RefreshCw size={17} strokeWidth={2} />
            These figures are out of date
          </p>
          <p className="mt-1.5 max-w-[80ch] text-body-sm text-content-secondary">
            {run.staleness.message}
          </p>
          <p className="mt-2 text-caption text-content-tertiary">
            Finalising is blocked until then — it cannot be undone, and these
            payslips would be missing the figures above.
          </p>
        </div>
      )}

      {/* Anomalies above the table — HR must see these before scrolling. */}
      {run.flaggedCount > 0 && (
        <div className="mb-5 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <TriangleAlert size={17} strokeWidth={2} />
            {run.flaggedCount} payslip{run.flaggedCount === 1 ? '' : 's'} need a look
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {run.payslips.filter((p) => p.flags.length).map((p) => (
              <li key={p.id} className="text-body-sm">
                <span className="font-medium text-content-primary">
                  {p.employee.firstName} {p.employee.lastName}
                </span>
                {p.flags.map((f) => (
                  <span key={f.code} className="block pl-0.5 text-content-secondary">
                    <span className={cn(
                      'font-medium',
                      f.level === 'danger' ? 'text-danger' : 'text-warning',
                    )}>
                      {f.label}
                    </span>
                    {' — '}{f.detail}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-sunken">
                {['Employee', 'Base', 'Allow.', 'Overtime', 'Bonus', 'Deductions', 'Net', ''].map((h, i) => (
                  <th key={h || i} className={cn(
                    'px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary',
                    i === 0 ? 'text-left' : 'text-right',
                  )}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.payslips.map((p) => {
                const flagged = p.flags.length > 0;
                const worst = p.flags.some((f) => f.level === 'danger') ? 'danger' : 'warning';
                const name = `${p.employee.firstName} ${p.employee.lastName}`;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      'border-t border-line-subtle transition-colors hover:bg-surface-hover',
                      flagged && (worst === 'danger'
                        ? 'bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]'
                        : 'bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]'),
                    )}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={name} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-body font-medium text-content-primary">{name}</p>
                          <p className="truncate text-caption text-content-tertiary">
                            {p.employee.department.name}
                          </p>
                        </div>
                        {flagged && (
                          <CircleAlert
                            size={15}
                            className={worst === 'danger' ? 'text-danger' : 'text-warning'}
                            aria-label={p.flags.map((f) => f.label).join(', ')}
                          />
                        )}
                      </div>
                      {/* An unexplained small figure on a payslip looks like
                          a bug. Name the reason on the row. */}
                      {p.proRata && (
                        <p className="mt-1 pl-[42px] text-caption text-content-tertiary">
                          Joined {formatDate(p.proRata.joined)} — paid{' '}
                          <span className="tabular font-medium text-content-secondary">
                            {p.proRata.payableDays} of {p.proRata.workingDaysInMonth}
                          </span>{' '}
                          working days, so base is pro-rated from{' '}
                          <span className="tabular">{formatCurrency(p.proRata.fullBaseSalary)}</span>
                        </p>
                      )}
                    </td>
                    <Money v={p.baseSalary} alwaysShow />
                    <Money v={p.allowances} />
                    <Money v={p.overtimeAmount} tone={p.overtimeAmount > 0 ? 'success' : undefined} />
                    <Money v={p.bonus} tone={p.bonus > 0 ? 'success' : undefined} />
                    <Money v={p.totalDeductions} tone={p.totalDeductions > 0 ? 'danger' : undefined} />
                    <td className="tabular px-3 py-3 text-right text-body font-semibold text-content-primary">
                      {formatCurrency(p.netSalary)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {isDraft && (
                        <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setEditing(p)}>
                          Adjust
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Finalise ${monthLabel(run.month, run.year)} payroll?`}
        description={
          `${run.payslips.length} payslips totalling ${formatCurrency(run.totals.net)} will be issued, ` +
          `${formatCurrency(run.totals.duesRecovered)} of dues recovered, and everyone notified. ` +
          `This cannot be undone.`
        }
        confirmLabel="Finalise payroll"
        tone="primary"
        loading={finalising}
        onConfirm={doFinalise}
        onCancel={() => setConfirming(false)}
      />

      <ConfirmDialog
        open={deleting}
        title="Delete this draft?"
        description="The calculated payslips are discarded. Nothing has been issued, so nobody is affected — you can recalculate the month at any time."
        confirmLabel="Delete draft"
        tone="danger"
        loading={removing}
        onConfirm={doDelete}
        onCancel={() => setDeleting(false)}
      />

      {editing && (
        <AdjustDialog runId={runId} payslip={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/**
 * A dash means "nothing here". Zero base salary means "not set", which is a
 * different thing and must not be hidden behind the same glyph.
 */
function Money({
  v, tone, alwaysShow,
}: {
  v: number;
  tone?: 'success' | 'danger';
  alwaysShow?: boolean;
}) {
  const blank = v === 0 && !alwaysShow;
  return (
    <td className={cn(
      'tabular px-3 py-3 text-right text-body',
      tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-content-primary',
      v === 0 && 'text-content-tertiary',
    )}>
      {blank ? '—' : formatCurrency(v)}
    </td>
  );
}

function Total({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
        {label}
      </p>
      <p className={cn(
        'tabular mt-2 font-display font-bold text-content-primary',
        big ? 'text-display-sm' : 'text-h1',
      )}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
