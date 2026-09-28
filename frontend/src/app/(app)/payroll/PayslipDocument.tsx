import { LogoMark } from '@/components/brand/Logo';
import { COMPANY } from '@/lib/company';
import { amountInWords } from '@/lib/numberToWords';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { monthLabel, type MyPayslip } from '@/store/api/endpoints/payrollApi';

/**
 * A payslip as a document, not a data dump.
 *
 * It is shown to landlords, banks and visa officers, so it carries what those
 * readers look for: who issued it, who it is for, the period it covers, the
 * components, and the net in both figures and words.
 */
export function PayslipDocument({ p }: { p: MyPayslip }) {
  const name = `${p.employee.firstName} ${p.employee.lastName}`;
  const period = monthLabel(p.payrollRun.month, p.payrollRun.year);
  const prorated = p.period.paidDays < p.period.workingDays;

  return (
    <article
      data-payslip
      className="mx-auto w-full max-w-[820px] bg-surface-raised text-content-primary"
    >
      {/* ── Letterhead ───────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-[var(--color-primary)] px-8 pb-5 pt-7">
        <div className="flex items-start gap-3">
          <LogoMark className="h-10 w-10 shrink-0 text-[var(--color-primary)]" />
          <div>
            <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]">
              {COMPANY.name}
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
              {COMPANY.tagline}
            </p>
            <p className="mt-2 text-caption leading-relaxed text-content-secondary">
              {COMPANY.addressLine1}
              <br />
              {COMPANY.addressLine2}
              <br />
              {COMPANY.email} · {COMPANY.phone}
              {COMPANY.registration && <><br />{COMPANY.registration}</>}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="font-display text-h2 font-bold tracking-[-0.01em]">PAYSLIP</p>
          <p className="text-body font-medium text-content-secondary">{period}</p>
          <p className="mt-2 text-caption text-content-tertiary">
            Reference
            <br />
            <span className="tabular font-medium text-content-secondary">
              PS-{p.payrollRun.year}{String(p.payrollRun.month).padStart(2, '0')}-
              {String(p.id).padStart(4, '0')}
            </span>
          </p>
        </div>
      </header>

      {/* ── Who and when ─────────────────────────────────────────── */}
      <section className="grid gap-x-8 gap-y-5 border-b border-line-subtle px-8 py-5 sm:grid-cols-2">
        <div>
          <SectionLabel>Employee</SectionLabel>
          <Field label="Name" value={name} strong />
          <Field label="Employee code" value={p.employee.employeeCode} mono />
          <Field label="Designation" value={p.employee.designation} />
          <Field label="Department" value={p.employee.department.name} />
          <Field label="Date of joining" value={formatDate(p.employee.joiningDate)} />
        </div>
        <div>
          <SectionLabel>Pay period</SectionLabel>
          <Field
            label="Period"
            value={`${formatDate(p.period.periodStart)} – ${formatDate(p.period.periodEnd)}`}
          />
          <Field
            label="Payment date"
            value={p.payrollRun.processedAt ? formatDate(p.payrollRun.processedAt) : '—'}
          />
          <Field label="Working days" value={String(p.period.workingDays)} mono />
          <Field
            label="Days paid"
            value={`${p.period.paidDays}${prorated ? ' (pro-rated)' : ''}`}
            mono
            highlight={prorated}
          />
          <Field label="Currency" value="PKR — Pakistani Rupee" />
        </div>
      </section>

      {/* ── The figures ──────────────────────────────────────────── */}
      <section className="grid border-b border-line-subtle sm:grid-cols-2">
        <div className="border-line-subtle px-8 py-5 sm:border-r">
          <SectionLabel>Earnings</SectionLabel>
          <Row label="Basic salary" value={p.baseSalary} />
          <Row label="Allowances" value={p.allowances} />
          <Row label="Overtime" value={p.overtimeAmount} />
          <Row label="Bonus" value={p.bonus} />
          <Row label="Gross earnings" value={p.gross} total />
        </div>
        <div className="px-8 py-5">
          <SectionLabel>Deductions</SectionLabel>
          <Row label="Unpaid leave" value={p.unpaidLeaveDeduction} />
          <Row label="Other deductions" value={p.otherDeductions} />
          <Row label="Loan / advance recovery" value={p.duesDeduction} />
          <Row label="Total deductions" value={p.totalDeductions} total />
        </div>
      </section>

      {/* ── Net pay ──────────────────────────────────────────────── */}
      <section className="bg-surface-sunken px-8 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="font-display text-h3 font-semibold">Net pay</span>
          <span className="tabular font-display text-display-sm font-bold">
            {formatCurrency(p.netSalary)}
          </span>
        </div>
        {/* In words: standard on a payslip here, and it makes the figure
            hard to alter after the fact. */}
        <p className="mt-2 border-t border-line-default pt-2.5 text-body-sm italic text-content-secondary">
          {amountInWords(p.netSalary)}
        </p>
      </section>

      <footer className="px-8 py-5 text-caption leading-relaxed text-content-tertiary">
        <p>
          This is a computer-generated payslip and does not require a
          signature. Figures shown are the record for {period}; a later change
          to salary or policy does not alter an issued payslip.
        </p>
        <p className="mt-1.5">
          Queries about any figure should go to {COMPANY.email}.
        </p>
      </footer>
    </article>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 border-b border-line-subtle pb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-content-secondary">
      {children}
    </p>
  );
}

function Field({
  label, value, strong, mono, highlight,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-[3px]">
      <span className="w-[112px] shrink-0 text-caption text-content-tertiary">{label}</span>
      <span className={cn(
        'text-body-sm',
        strong ? 'font-semibold text-content-primary' : 'text-content-primary',
        mono && 'tabular',
        highlight && 'text-warning',
      )}>
        {value}
      </span>
    </div>
  );
}

function Row({ label, value, total }: { label: string; value: number; total?: boolean }) {
  return (
    <div className={cn(
      'flex items-baseline justify-between py-[5px] text-body-sm',
      total && 'mt-1.5 border-t border-line-default pt-2 font-bold',
    )}>
      <span className={total ? 'text-content-primary' : 'text-content-secondary'}>
        {label}
      </span>
      <span className={cn('tabular', value === 0 && !total && 'text-content-tertiary')}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
