'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useAdjustPayslipMutation, type RunPayslip,
} from '@/store/api/endpoints/payrollApi';

/**
 * Only bonus and other deductions are editable.
 *
 * Base, allowances, overtime and dues come from the employee record,
 * attendance and the dues ledger. Letting HR type over those would break the
 * link between a payslip and the records it was derived from.
 */
export function AdjustDialog({
  runId, payslip, onClose,
}: {
  runId: number;
  payslip: RunPayslip;
  onClose: () => void;
}) {
  const [bonus, setBonus] = useState(String(payslip.bonus));
  const [other, setOther] = useState(String(payslip.otherDeductions));
  const [reason, setReason] = useState('');
  const [adjust, { isLoading }] = useAdjustPayslipMutation();

  const name = `${payslip.employee.firstName} ${payslip.employee.lastName}`;
  const preview =
    payslip.baseSalary + payslip.allowances + payslip.overtimeAmount + Number(bonus || 0) -
    payslip.unpaidLeaveDeduction - Number(other || 0) - payslip.duesDeduction;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adjust({
        runId, payslipId: payslip.id,
        bonus: Number(bonus || 0),
        otherDeductions: Number(other || 0),
        reason: reason.trim(),
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
      <form onSubmit={submit} className="animate-scale-in relative w-full max-w-[460px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl">
        <h2 className="font-display text-h3 text-content-primary">Adjust {name}</h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          Base, allowances, overtime and dues come from their records and
          cannot be typed over here.
        </p>

        <div className="mt-5">
          <Input
            label="Bonus" type="number" min={0} step="0.01"
            value={bonus} onChange={(e) => setBonus(e.target.value)}
          />
          <Input
            label="Other deductions" type="number" min={0} step="0.01"
            value={other} onChange={(e) => setOther(e.target.value)}
          />
          <Input
            label="Reason" required
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Q3 delivery bonus approved by department head"
            hint="Recorded in the audit log against your name."
          />
        </div>

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
          <Button type="submit" variant="primary" loading={isLoading} disabled={reason.trim().length < 5}>
            Save adjustment
          </Button>
        </div>
      </form>
    </div>
  );
}
