# Feature 05 — Payroll & Salary

**Depends on:** Employees, Attendance, Leave, Dues.
**Contains AI:** yes — explanation and anomaly flagging (read-only).

## Purpose

Calculate and issue monthly salaries. This is the module where correctness
matters most and where the AI is most firmly excluded from the arithmetic.

> **Rule 1 applies with full force here.** Every figure on a payslip is produced
> by a pure TypeScript function with unit tests. The AI reads the finished
> payslip and explains it. It never computes a single number.

## Roles

| Action | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| View own payslips | ✓ | ✓ | ✓ |
| View all payslips | ✗ | ✓ | ✓ |
| Create a draft run | ✗ | ✓ | ✓ |
| Edit a draft payslip | ✗ | ✓ | ✓ |
| **Finalise a run** | ✗ | ✗ | **✓** |
| Delete a draft run | ✗ | ✗ | ✓ |

Finalising is ADMIN-only. It is irreversible — it issues payslips and deducts
dues — so it gets a second pair of eyes.

## Data

`payroll_runs`, `payslips` — see
[Database Schema](../03-database-schema.md#payroll).

Payslips are **snapshots**. Every figure is stored permanently so a payslip
issued in March cannot change when the formula or the employee's salary changes
in April.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/payroll/runs` | HR, ADMIN | Create a DRAFT for a month |
| GET | `/payroll/runs` | HR, ADMIN | |
| GET | `/payroll/runs/:id` | HR, ADMIN | Run + all draft payslips |
| PATCH | `/payroll/runs/:id/payslips/:pid` | HR, ADMIN | Adjust bonus or deductions on a DRAFT |
| POST | `/payroll/runs/:id/finalise` | ADMIN | Irreversible. Audited |
| DELETE | `/payroll/runs/:id` | ADMIN | DRAFT only |
| GET | `/payroll/payslips/me` | any | Own history |
| GET | `/payroll/payslips/:id` | owner, HR | Ownership checked |
| GET | `/payroll/payslips/:id/pdf` | owner, HR | Download |

## The calculation

A pure function. No database, no I/O, no AI. Fully unit-tested.

```ts
export function calculateNetSalary(input: PayrollInput): PayrollResult {
  const {
    baseSalary, allowances, overtimeHours, hourlyRate, overtimeMultiplier,
    unpaidLeaveDays, workingDaysInMonth, otherDeductions, duesInstallment, bonus,
  } = input;

  const overtimeAmount = round2(overtimeHours * hourlyRate * overtimeMultiplier);
  const perDayRate = round2(baseSalary / workingDaysInMonth);
  const unpaidLeaveDeduction = round2(unpaidLeaveDays * perDayRate);

  const gross = baseSalary + allowances + overtimeAmount + bonus;
  const deductions = unpaidLeaveDeduction + otherDeductions + duesInstallment;

  return {
    baseSalary, allowances, overtimeAmount, bonus,
    unpaidLeaveDeduction, otherDeductions, duesDeduction: duesInstallment,
    netSalary: round2(gross - deductions),
  };
}
```

```
netSalary = baseSalary + allowances + overtimeAmount + bonus
          − unpaidLeaveDeduction − otherDeductions − duesDeduction
```

`hourlyRate = baseSalary / (workingDaysInMonth × STANDARD_WORK_HOURS)`

### Rounding

Round to 2 decimals **once, at the end of each component**, never mid-formula
and never at the very end only. Use `DECIMAL(12,2)` in MySQL and never
JavaScript floats for stored money. `0.1 + 0.2 !== 0.3`, and in a payroll system
that eventually becomes a complaint.

## Business rules

1. **One run per month.** Unique on `(month, year)`.
2. **A run starts as `DRAFT`.** It computes a payslip for every `ACTIVE`
   employee, and HR reviews before anything is issued.
3. **A DRAFT is recalculable.** Deleting and recreating it is safe.
4. **Finalising is a transaction:**
   ```
   UPDATE payroll_runs SET status = FINALISED, processed_by, processed_at
   INSERT due_payments for each dues installment recovered
   UPDATE dues SET status = CLEARED where fully repaid
   INSERT notification per employee
   queue email per employee
   ```
5. **A FINALISED run is immutable.** No edits, no deletion. Corrections are a
   manual adjustment on the next month's run, with a note.
6. **Employees who joined mid-month are pro-rated** by working days from the
   joining date.
7. **Employees on `RESIGNED` or `TERMINATED` are excluded** unless they were
   active for part of the month.
8. **A dues installment is capped** — never deduct more than the remaining
   balance, and never take net salary below zero. If the installment would, take
   what is left and log it.
9. **Overtime is read from attendance**, never entered by hand.
10. **Unpaid leave days are read from approved leave** of an unpaid type.

## AI involvement

**Read-only. Explanation and flagging, never calculation.**

### Explain my payslip

Employee clicks "Why is this different from last month?".

```
"Your net salary is PKR 3,200 lower than August. Two reasons: you took 2 days
 of unpaid leave (−PKR 3,846), partly offset by 6 hours of overtime
 (+PKR 646). Your base salary and allowances are unchanged."
```

The AI is given both payslips as tool output and asked to describe the
difference. It does not subtract them — the diff is computed and handed to it.

### Flag anomalies before finalising

Deterministic detection, AI description:

```ts
// Rules engine decides
if (abs(net - prevNet) / prevNet > 0.20) flag('LARGE_CHANGE');
if (overtimeHours > 40)                  flag('EXCESSIVE_OVERTIME');
if (net < 0)                             flag('NEGATIVE_NET');
if (deductions > gross * 0.5)            flag('DEDUCTIONS_OVER_HALF');
```

```
"3 payslips need review before you finalise. Ahmed's net is 34% below last
 month — 5 unpaid leave days. Sara logged 52 overtime hours, more than double
 her usual. Bilal's deductions are 61% of gross because two loan installments
 landed in the same month."
```

This is genuinely useful and impossible to do wrong, because the AI is not
producing the numbers — it is reading flags that a tested function produced.

### Structurally prevented

No AI tool writes to `payslips` or `payroll_runs`. The finalise endpoint is
ADMIN-only and reachable only from the UI button.

## Frontend

### Screens

| Screen | Route | Role |
|---|---|---|
| My payslips | `/payroll` | any |
| Payslip detail | `/payroll/:id` | owner, HR |
| Payroll runs | `/payroll/runs` | HR, ADMIN |
| Run detail / review | `/payroll/runs/:id` | HR, ADMIN |

### Run detail — the review screen

- Header: month, status badge, total payout, employee count
- AI anomaly panel at the top, flagged rows highlighted
- Table: every employee with every component and net, editable while DRAFT
- **Finalise** button — ADMIN only, disabled for HR, behind a confirmation
  dialog that states plainly: *this cannot be undone*

### Payslip detail

A clean breakdown — earnings on the left, deductions on the right, net in a
large figure at the bottom. An "Explain this payslip" button opens the AI panel.
Download PDF.

### RTK Query

```ts
getMyPayslips: providesTags: [{ type: 'Payslip', id: 'MY_LIST' }]
getPayrollRun: providesTags: (r, e, id) => [{ type: 'PayrollRun', id }]

createRun:  invalidatesTags: [{ type: 'PayrollRun', id: 'LIST' }]
updateDraftPayslip: invalidatesTags: (r, e, { runId }) => [
  { type: 'PayrollRun', id: runId },
]
finaliseRun: invalidatesTags: (r, e, { id }) => [
  { type: 'PayrollRun', id },
  { type: 'PayrollRun', id: 'LIST' },
  { type: 'Payslip', id: 'MY_LIST' },
  { type: 'Due', id: 'LIST' },        // installments were recovered
]
```

The `Due` invalidation is the cross-feature one. Finalising payroll changes
every employee's outstanding balance.

Poll the run detail at 10 s while status is `PROCESSING`.

## Manual setup

🔴 Confirm in `.env`:

```bash
STANDARD_WORK_HOURS=8
OVERTIME_RATE_MULTIPLIER=1.5
```

🔴 Decide your currency and set it in the frontend `formatCurrency` helper. The
docs assume PKR.

## Testing

`payroll.service.spec.ts` is the most important test file in the project. It
must cover:

- Base salary only, no extras
- With allowances
- With overtime
- With unpaid leave
- With dues installment
- With bonus
- All components at once
- Zero of each component
- Dues installment larger than the remaining balance (must cap)
- Deductions exceeding gross (must not go negative)
- Mid-month joiner pro-rating
- Rounding: values that expose float error, e.g. base 45000.10 with 3 overtime hours

## Done when

- [ ] Creating a run produces a draft payslip for every active employee
- [ ] Every component matches a hand calculation
- [ ] Overtime comes from attendance, not manual entry
- [ ] Unpaid leave produces the correct deduction
- [ ] Dues installments appear and are capped at the remaining balance
- [ ] HR gets 403 on finalise; ADMIN succeeds
- [ ] Finalising creates `due_payments` and clears fully-repaid dues
- [ ] A finalised run cannot be edited or deleted
- [ ] Employees receive a notification and an email
- [ ] The payslip PDF matches the screen exactly
- [ ] The AI explanation states the same numbers as the payslip
- [ ] Anomaly flags come from the rules engine, not the model
- [ ] Every test above passes
