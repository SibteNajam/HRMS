'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CircleCheck, FileEdit, Play, Plus, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { CardListSkeleton } from '@/components/ui/loading';
import { formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  MONTHS, monthLabel, useCreateRunMutation, useGetRunsQuery,
} from '@/store/api/endpoints/payrollApi';

export default function PayrollRunsPage() {
  const now = new Date();
  const { data, isLoading } = useGetRunsQuery();
  const [create, { isLoading: creating }] = useCreateRunMutation();

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [opening, setOpening] = useState(false);

  async function start() {
    try {
      const run = await create({ month, year }).unwrap();
      toast.success(`Draft created for ${monthLabel(month, year)}`, {
        description: `${run.payslips.length} payslips calculated. Nothing has been paid yet.`,
      });
      setOpening(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Payroll runs"
        subtitle="One run per month. A draft is calculated but not issued — an administrator finalises it."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setOpening(true)}>
            New run
          </Button>
        }
      />

      {opening && (
        <div className="animate-fade-up mb-5 rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
          <h2 className="font-display text-h3 text-content-primary">Start a payroll run</h2>
          <p className="mt-1 max-w-[560px] text-body-sm text-content-secondary">
            This calculates a payslip for every active employee from their
            attendance, approved unpaid leave and outstanding dues. Nothing is
            paid and no dues are deducted until an administrator finalises it.
          </p>
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <div className="w-[180px]">
              <Select label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
            </div>
            <div className="w-[140px]">
              <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <div className="flex gap-2 pt-[26px]">
              <Button variant="secondary" onClick={() => setOpening(false)} disabled={creating}>
                Cancel
              </Button>
              <Button variant="primary" icon={Play} loading={creating} onClick={start}>
                Calculate draft
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : !data?.length ? (
        <div className="rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <Wallet size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">No payroll runs yet</h3>
          <p className="mx-auto mt-1.5 max-w-[420px] text-body-sm text-content-secondary">
            Start one for a month and every active employee gets a draft
            payslip you can review before anything is issued.
          </p>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-3">
          {data.map((run) => (
            <Link
              key={run.id}
              href={`/payroll/runs/${run.id}`}
              className="flex items-center gap-4 rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm transition-colors hover:border-line-default"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-selected">
                {run.status === 'FINALISED'
                  ? <CircleCheck size={19} strokeWidth={1.75} className="text-content-selected" />
                  : <FileEdit size={19} strokeWidth={1.75} className="text-content-selected" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-h3 text-content-primary">
                  {monthLabel(run.month, run.year)}
                </p>
                <p className="text-caption text-content-tertiary">
                  {run._count?.payslips ?? 0} payslips
                  {run.processedAt && ` · finalised ${formatDate(run.processedAt)}`}
                  {run.processor?.employee &&
                    ` by ${run.processor.employee.firstName} ${run.processor.employee.lastName}`}
                </p>
              </div>
              <Badge tone={run.status === 'FINALISED' ? 'success' : 'warning'}>
                {run.status === 'FINALISED' ? 'Finalised' : 'Draft'}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
