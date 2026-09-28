'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CircleAlert, Layers, PenLine, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useAppSelector } from '@/store/hooks';
import {
  useGetSalaryStructureQuery, useUpdateSalaryMutation, type SalaryRow,
} from '@/store/api/endpoints/payrollApi';

export default function SalaryStructurePage() {
  const me = useAppSelector((s) => s.auth.user)!;
  const isAdmin = me.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [editing, setEditing] = useState<SalaryRow | null>(null);

  const { data, isLoading } = useGetSalaryStructureQuery();

  const rows = (data ?? []).filter((r) =>
    !debounced ||
    `${r.firstName} ${r.lastName} ${r.employeeCode}`.toLowerCase().includes(debounced.toLowerCase()),
  );
  const monthlyTotal = rows.reduce((sum, r) => sum + r.monthlyCost, 0);
  // Self sign-up creates an employee with no salary. Until one is set they
  // produce a zero payslip, so this is the first thing to fix.
  const unset = rows.filter((r) => r.monthlyCost === 0);

  return (
    <>
      <PageHeader
        title="Salary structure"
        subtitle="Base salary and fixed allowances. These feed every payroll run."
      />

      <div className="stagger mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Employees" value={String(rows.length)} />
        <Stat label="Monthly base cost" value={formatCurrency(monthlyTotal)} />
        <Stat label="Annual cost" value={formatCurrency(monthlyTotal * 12)} />
      </div>

      {unset.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4">
          <CircleAlert size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold text-warning">
              {unset.length} employee{unset.length === 1 ? '' : 's'} with no salary set
            </p>
            <p className="mt-0.5 text-body-sm text-content-secondary">
              {unset.map((r) => `${r.firstName} ${r.lastName}`).join(', ')} — they
              will produce a zero payslip until a salary is set.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        <div className="border-b border-line-subtle p-4">
          <div className="max-w-[340px]">
            <Input
              placeholder="Search name or code…" icon={Search}
              value={search} onChange={(e) => setSearch(e.target.value)}
              aria-label="Search employees"
            />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : !rows.length ? (
          <div className="p-16 text-center">
            <Layers size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">No employees match</h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-sunken">
                  {['Employee', 'Base salary', 'Allowances', 'Monthly cost', ''].map((h, i) => (
                    <th key={h || i} className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const name = `${r.firstName} ${r.lastName}`;
                  const noSalary = r.monthlyCost === 0;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-t border-line-subtle transition-colors hover:bg-surface-hover',
                        noSalary && 'bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-body font-medium text-content-primary">
                              {name}
                              {noSalary && (
                                <CircleAlert size={14} className="shrink-0 text-warning" aria-label="No salary set" />
                              )}
                            </p>
                            <p className="truncate text-caption text-content-tertiary">
                              {r.designation} · {r.department.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="tabular px-4 py-3 text-right text-body text-content-primary">
                        {formatCurrency(r.baseSalary)}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-body text-content-primary">
                        {formatCurrency(r.allowances)}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-body font-semibold text-content-primary">
                        {formatCurrency(r.monthlyCost)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin ? (
                          <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setEditing(r)}>
                            Edit
                          </Button>
                        ) : (
                          <span className="text-caption text-content-tertiary">Admin only</span>
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

      {editing && <SalaryDialog row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SalaryDialog({ row, onClose }: { row: SalaryRow; onClose: () => void }) {
  const [baseSalary, setBase] = useState(String(row.baseSalary));
  const [allowances, setAllow] = useState(String(row.allowances));
  const [reason, setReason] = useState('');
  const [save, { isLoading }] = useUpdateSalaryMutation();

  const name = `${row.firstName} ${row.lastName}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({
        employeeId: row.id,
        baseSalary: Number(baseSalary),
        allowances: Number(allowances),
        reason: reason.trim(),
      }).unwrap();
      toast.success(`${name}'s salary updated`, {
        description: 'Applies to the next payroll run. Issued payslips are unchanged.',
      });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <form onSubmit={submit} className="animate-scale-in relative w-full max-w-[440px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl">
        <h2 className="font-display text-h3 text-content-primary">Change {name}&apos;s salary</h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          Takes effect from the next payroll run. Payslips already issued keep
          the figures they were issued with.
        </p>

        <div className="mt-5">
          <Input label="Base salary" type="number" min={0} step="0.01" required
            value={baseSalary} onChange={(e) => setBase(e.target.value)} />
          <Input label="Fixed allowances" type="number" min={0} step="0.01" required
            value={allowances} onChange={(e) => setAllow(e.target.value)} />
          <Input label="Reason" required
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Annual review — promotion to Senior Developer"
            hint="Salary changes are always audited." />
        </div>

        <div className="mb-4 flex items-baseline justify-between rounded-lg bg-surface-sunken px-3.5 py-3">
          <span className="text-body-sm text-content-secondary">New monthly cost</span>
          <span className="tabular font-display text-h2 font-bold text-content-primary">
            {formatCurrency(Number(baseSalary || 0) + Number(allowances || 0))}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={reason.trim().length < 5}>
            Save salary
          </Button>
        </div>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">{label}</p>
      <p className="tabular mt-2 font-display text-h1 font-bold text-content-primary">{value}</p>
    </div>
  );
}
