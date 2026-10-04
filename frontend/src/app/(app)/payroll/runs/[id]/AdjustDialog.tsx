'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useAdjustPayslipMutation, type RunPayslip,
} from '@/store/api/endpoints/payrollApi';

/**
 * Two deductions, and only one of them is HR's to set.
 *
 * Leave deduction is computed from approved unpaid leave when the run is
 * created — the days, the dates and the per-day rate all come from records
 * the employee can check. It is shown here, with its reasoning, and it
 * cannot be typed over: a figure HR can edit is a figure nobody can trace
 * back to a leave request.
 *
 * Other deductions is the opposite — there is no record to derive it from,
 * so it needs a person and their reason.
 */
export function AdjustDialog({
  runId, payslip, onClose,
}: {
  runId: number;
  payslip: RunPayslip;
  onClose: () => void;
}) {
  const [bonus, setBonus] = useState(String(payslip.bonus));
  const [bonusReason, setBonusReason] = useState(payslip.bonusReason ?? '');
  const [other, setOther] = useState(String(payslip.otherDeductions));
  const [otherReason, setOtherReason] = useState(payslip.otherDeductionsReason ?? '');
  const [adjust, { isLoading }] = useAdjustPayslipMutation();

  const name = `${payslip.employee.firstName} ${payslip.employee.lastName}`;
  const bonusValue = Number(bonus || 0);
  const otherValue = Number(other || 0);

  const preview =
    payslip.baseSalary + payslip.allowances + payslip.overtimeAmount + bonusValue -
    payslip.unpaidLeaveDeduction - otherValue - payslip.duesDeduction;

  // A reason is required only for a figure that is actually there. Clearing
  // an amount back to zero needs no justification.
  const missing =
    (bonusValue > 0 && bonusReason.trim().length < 3) ||
    (otherValue > 0 && otherReason.trim().length < 3);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adjust({
        runId, payslipId: payslip.id,
        bonus: bonusValue,
        otherDeductions: otherValue,
        bonusReason: bonusReason.trim() || undefined,
        otherDeductionsReason: otherReason.trim() || undefined,
      }).unwrap();
      toast.success(`${name}'s payslip adjusted`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />

      <form
        onSubmit={submit}
        className="animate-scale-in relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl"
      >
        <h2 className="font-display text-h3 text-content-primary">Adjust {name}</h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          Base, allowances, overtime and dues come from their records and
          cannot be typed over here.
        </p>

        {/* ── Additions ──────────────────────────────────────────────── */}
        <Section title="Bonus">
          <div className="grid gap-x-3 sm:grid-cols-[150px_1fr]">
            <Input
              label="Amount" type="number" min={0} step="0.01"
              value={bonus} onChange={(e) => setBonus(e.target.value)}
            />
            <Input
              label="Reason"
              required={bonusValue > 0}
              disabled={bonusValue <= 0}
              value={bonusReason} onChange={(e) => setBonusReason(e.target.value)}
              placeholder="Q3 delivery bonus approved by department head"
            />
          </div>
        </Section>

        {/* ── Deductions ─────────────────────────────────────────────── */}
        <Section title="Deductions">
          {/* Computed, so it is reported rather than offered for editing. */}
          <div className="rounded-lg border border-line-subtle bg-surface-sunken p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-content-secondary">
                <CalendarOff size={13} strokeWidth={2} aria-hidden />
                Leave deduction
              </span>
              <span className="tabular font-display text-h3 font-bold text-content-primary">
                {payslip.unpaidLeaveDeduction > 0
                  ? formatCurrency(payslip.unpaidLeaveDeduction)
                  : '—'}
              </span>
            </div>

            <p className="mt-1.5 flex items-start gap-1.5 text-caption leading-snug text-content-tertiary">
              <Lock size={11} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {payslip.leaveDeductionNote ??
                  'No unpaid leave this month, so nothing is withheld.'}
              </span>
            </p>
          </div>

          <div className="mt-3 grid gap-x-3 sm:grid-cols-[150px_1fr]">
            <Input
              label="Other deduction" type="number" min={0} step="0.01"
              value={other} onChange={(e) => setOther(e.target.value)}
            />
            <Input
              label="Reason"
              required={otherValue > 0}
              disabled={otherValue <= 0}
              value={otherReason} onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Damaged equipment, agreed with their manager"
            />
          </div>
        </Section>

        <p className="mb-4 text-caption text-content-tertiary">
          Both reasons are stored on the payslip and in the audit log against
          your name.
        </p>

        <div className="mb-4 flex items-baseline justify-between rounded-lg bg-surface-sunken px-3.5 py-3">
          <span className="text-body-sm text-content-secondary">Net becomes</span>
          <span className="tabular font-display text-h2 font-bold text-content-primary">
            {formatCurrency(Math.max(0, preview))}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={missing}>
            Save adjustment
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-content-tertiary">
        {title}
      </h3>
      {children}
    </section>
  );
}
