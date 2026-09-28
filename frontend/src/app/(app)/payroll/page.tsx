'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, FileText, Sparkles, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ThinkingDots } from '@/components/ui/loading';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  monthLabel, useExplainPayslipMutation, useGetMyPayslipsQuery, type MyPayslip,
} from '@/store/api/endpoints/payrollApi';

export default function MyPayslipsPage() {
  const { data, isLoading } = useGetMyPayslipsQuery();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <PageHeader
        title="My payslips"
        subtitle="Issued payslips. Expand one to see the breakdown, ask why it changed, or download it."
      />

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        {isLoading ? (
          <TableSkeleton rows={4} columns={4} avatar={false} />
        ) : !data?.length ? (
          <div className="p-16 text-center">
            <Wallet size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">No payslips yet</h3>
            <p className="mx-auto mt-1.5 max-w-[400px] text-body-sm text-content-secondary">
              Payslips appear once HR has run payroll for a month and an
              administrator has finalised it.
            </p>
          </div>
        ) : (
          <ul className="stagger">
            {data.map((p) => (
              <li key={p.id} className="border-b border-line-subtle last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                  aria-expanded={open === p.id}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-selected">
                    <FileText size={19} strokeWidth={1.75} className="text-content-selected" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-h3 text-content-primary">
                      {monthLabel(p.payrollRun.month, p.payrollRun.year)}
                    </p>
                    <p className="text-caption text-content-tertiary">
                      Issued {p.payrollRun.processedAt ? formatDate(p.payrollRun.processedAt) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-display text-h2 font-bold text-content-primary">
                      {formatCurrency(p.netSalary)}
                    </p>
                    <p className="text-caption text-content-tertiary">net pay</p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={cn(
                      'shrink-0 text-content-tertiary transition-transform duration-200',
                      open === p.id && 'rotate-180',
                    )}
                  />
                </button>

                <div className={cn(
                  'grid transition-all duration-200 ease-out',
                  open === p.id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}>
                  <div className="overflow-hidden">
                    <Breakdown p={p} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Earnings left, deductions right, net large at the bottom. */
function Breakdown({ p }: { p: MyPayslip }) {
  const [explain, { isLoading }] = useExplainPayslipMutation();
  const [explanation, setExplanation] = useState<string | null>(null);

  async function askWhy() {
    try {
      const r = await explain(p.id).unwrap();
      setExplanation(r.explanation);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  /**
   * Browser print, not a PDF library. "Save as PDF" is in every print
   * dialog, the output is selectable text rather than an image, and it needs
   * no dependency. The print stylesheet hides everything but the payslip.
   */
  function download() {
    document.body.setAttribute('data-printing', String(p.id));
    window.print();
    setTimeout(() => document.body.removeAttribute('data-printing'), 500);
  }

  return (
    <div className="border-t border-line-subtle bg-surface-sunken px-5 py-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
            Earnings
          </p>
          <Line label="Basic salary" value={p.baseSalary} />
          <Line label="Allowances" value={p.allowances} />
          <Line label="Overtime" value={p.overtimeAmount} />
          <Line label="Bonus" value={p.bonus} />
          <Line label="Gross" value={p.gross} bold />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
            Deductions
          </p>
          <Line label="Unpaid leave" value={p.unpaidLeaveDeduction} />
          <Line label="Other deductions" value={p.otherDeductions} />
          <Line label="Dues recovered" value={p.duesDeduction} />
          <Line label="Total" value={p.totalDeductions} bold />
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-line-default pt-4">
        <span className="text-body font-semibold text-content-primary">Net salary</span>
        <span className="tabular font-display text-display-sm text-content-primary">
          {formatCurrency(p.netSalary)}
        </span>
      </div>

      {/* What an employee actually does with a payslip: understand it, and
          keep a copy for a landlord, a bank or a visa application. */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line-default pt-4 print:hidden">
        <Button variant="secondary" icon={Sparkles} loading={isLoading} onClick={askWhy}>
          Why is this amount?
        </Button>
        <Button variant="secondary" icon={Download} onClick={download}>
          Download
        </Button>
      </div>

      {isLoading && (
        <div className="mt-3 rounded-lg border border-line-subtle bg-surface-raised px-4 py-3">
          <ThinkingDots label="Reading your payslips…" />
        </div>
      )}

      {explanation && !isLoading && (
        <div className="animate-fade-up mt-3 rounded-lg border border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-[color-mix(in_srgb,var(--info)_8%,transparent)] p-4 print:hidden">
          <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold text-info">
            <Sparkles size={13} strokeWidth={2} />
            AI explanation
          </p>
          <p className="text-body leading-relaxed text-content-primary">{explanation}</p>
          <p className="mt-2 text-caption text-content-tertiary">
            Generated from your own payslips. The figures above are the record —
            ask HR if anything looks wrong.
          </p>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={cn(
      'flex items-baseline justify-between py-1.5 text-body',
      bold && 'mt-1 border-t border-line-default pt-2 font-semibold',
    )}>
      <span className={bold ? 'text-content-primary' : 'text-content-secondary'}>{label}</span>
      {/* Right-aligned and tabular so figures line up down the column. */}
      <span className="tabular text-content-primary">{formatCurrency(value)}</span>
    </div>
  );
}
