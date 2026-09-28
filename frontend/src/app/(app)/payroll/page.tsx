'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, FileText, Sparkles, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ThinkingDots } from '@/components/ui/loading';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  monthLabel, useExplainPayslipMutation, useGetMyPayslipsQuery, type MyPayslip,
} from '@/store/api/endpoints/payrollApi';
import { PayslipDocument } from './PayslipDocument';

export default function MyPayslipsPage() {
  const { data, isLoading } = useGetMyPayslipsQuery();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="My payslips"
          subtitle="Expand one to see the full payslip, ask why the amount is what it is, or download it."
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} columns={4} avatar={false} />
      ) : !data?.length ? (
        <div className="rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <Wallet size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">No payslips yet</h3>
          <p className="mx-auto mt-1.5 max-w-[400px] text-body-sm text-content-secondary">
            Payslips appear once HR has run payroll for a month and an
            administrator has finalised it.
          </p>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-3">
          {data.map((p) => (
            <PayslipCard
              key={p.id}
              p={p}
              open={open === p.id}
              onToggle={() => setOpen(open === p.id ? null : p.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PayslipCard({
  p, open, onToggle,
}: {
  p: MyPayslip;
  open: boolean;
  onToggle: () => void;
}) {
  const [explain, { isLoading }] = useExplainPayslipMutation();
  const [explanation, setExplanation] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  async function askWhy() {
    try {
      setExplanation(null);
      const r = await explain(p.id).unwrap();
      setExplanation(r.explanation);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  /**
   * Browser print rather than a PDF library. "Save as PDF" is in every print
   * dialog, the result is selectable text rather than an image, and it costs
   * no dependency. The attribute lets the stylesheet print this payslip only.
   */
  function download() {
    // Marking the element beats matching its id in CSS: the stylesheet does
    // not need to know how many payslips exist.
    cardRef.current?.setAttribute('data-print-target', '');
    document.body.setAttribute('data-printing', '');
    window.print();
    window.setTimeout(() => {
      document.body.removeAttribute('data-printing');
      cardRef.current?.removeAttribute('data-print-target');
    }, 400);
  }

  return (
    <section
      ref={cardRef}
      data-payslip-card={p.id}
      className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm"
    >
      {/* Summary row — the whole list stays scannable when collapsed. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover print:hidden"
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
            {' · '}{p.period.paidDays} of {p.period.workingDays} working days
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
            open && 'rotate-180',
          )}
        />
      </button>

      <div className={cn(
        'grid transition-all duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}>
        <div className="overflow-hidden">
          <div className="border-t border-line-subtle">
            <PayslipDocument p={p} />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line-subtle px-8 py-4 print:hidden">
            <Button variant="secondary" icon={Sparkles} loading={isLoading} onClick={askWhy}>
              Why is this amount?
            </Button>
            <Button variant="secondary" icon={Download} onClick={download}>
              Download
            </Button>
          </div>

          {isLoading && (
            <div className="border-t border-line-subtle px-8 py-4 print:hidden">
              <ThinkingDots label="Reading your payslips…" />
            </div>
          )}

          {explanation && !isLoading && (
            <div className="animate-fade-up border-t border-line-subtle px-8 py-4 print:hidden">
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-[color-mix(in_srgb,var(--info)_8%,transparent)] p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold text-info">
                  <Sparkles size={13} strokeWidth={2} />
                  AI explanation
                </p>
                <p className="text-body leading-relaxed text-content-primary">{explanation}</p>
                <p className="mt-2 text-caption text-content-tertiary">
                  Generated from your own payslips. The figures above are the
                  record — ask HR if anything looks wrong.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
