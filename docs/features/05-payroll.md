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

## When payroll runs

**A draft can be created at any time. It can only be finalised once the
month is over.**

Those are two different questions, and the guard belongs on the second one.
Creating a draft mid-month is useful: it shows HR where payroll is heading,
and nothing is paid. Finalising is the irreversible step — payslips frozen,
dues recovered — and that cannot happen while overtime and unpaid leave are
still accumulating.

A draft for a running month is labelled a **forecast** on screen, with the
date it can be finalised:

> October 2026 is not over yet, so these figures are still a forecast.
> Payroll runs in arrears: this can be finalised from 2026-11-01 onwards.

The boundary is the end of the last day, not its start — somebody can work
the 31st, and somebody else can take leave on it.

### Recalculate

A payslip is a snapshot. Leave approved after a draft is calculated is
missing from it, and with automatic approval that happens without anybody
touching the system.

**Recalculate** re-runs the whole calculation from the records as they
stand. It is available on any draft, and it is what makes a forecast worth
reading.

| Recomputed | Preserved |
|---|---|
| Base, allowances, overtime | **Bonus** and its reason |
| Unpaid leave and its note | **Other deductions** and its reason |
| Dues installment and cap | |

Losing HR's own figures to a refresh would make the button unusable on any
run somebody had already worked on, so they are put back and the net is
re-derived around them. Employees hired into the month since the draft was
made get a payslip added.

`computeMonth()` is shared by creation and recalculation. A refresh that
computed anything differently would be a second payroll engine, and only one
of them would be the tested one.

### Knowing when it is out of date

`draftStaleness()` compares the records against `recalculatedAt ?? createdAt`
and reports unpaid leave approved, and attendance added, since. Measuring
from the last recalculation rather than from creation is what stops a draft
reporting itself out of date for ever, immediately after being brought up to
date.

| Where | What happens |
|---|---|
| Run detail screen | A banner with a **Recalculate** button |
| Finalise button | Disabled, with the reason in its tooltip |
| Finalise endpoint | **Refused** — it is irreversible and recovers dues |

### What this system does not have: arrears

Real payroll handles a late item by putting it on the **next** month's
payslip as an arrears line, never by reopening a closed month. This system
has no arrears line, which is why a month must be complete before it can be
finalised: there is nowhere for a late figure to go afterwards.

A deliberate scope decision rather than an oversight. Paying in arrears
removes the need for one.

## What a "payroll run" is

The word confuses people, so plainly: **a payroll run is processing everyone's
salary for one month, in one batch.**

| Term | Means |
|---|---|
| **Run** | One month's payroll for the whole company |
| **DRAFT** | Calculated but not issued. A preview HR checks. Nobody is paid, no dues are deducted |
| **FINALISED** | Signed off. Payslips issued, dues recovered, everyone notified. Irreversible |

It is the same shape as preparing payslips, checking them, then signing them
off — the draft exists so mistakes are caught before money moves.

## Who does what, and why it is split

| Step | Role | Reversible |
|---|---|---|
| Create the draft | HR | Yes — delete and recalculate |
| Adjust a bonus or deduction | HR | Yes, while DRAFT |
| **Finalise** | **ADMIN** | **No** |
| Change a salary | ADMIN | Affects future runs only |

HR prepares, an administrator signs off. The split exists because finalising
is the step that actually pays people and takes money off them, and it cannot
be undone — so it gets a second pair of eyes.

## Where each number comes from

Nothing on a payslip is typed in except bonus and other deductions. Everything
else is derived from a module that already exists, which is why payroll is
built last.

| Component | Source |
|---|---|
| Base salary, allowances | Employee record |
| Overtime | **Attendance** — minutes beyond the standard day |
| Unpaid leave | **Leave** — approved days of an unpaid type |
| Dues recovered | **Dues** — monthly installment, capped |
| Bonus, other deductions | HR, while the run is DRAFT |

### Two deductions, and only one is HR's to set

The adjust dialog used to offer a single "Other deductions" box and show the
unpaid-leave figure nowhere at all. HR had to work out what the deduction was
for by opening the leave module, and the employee had no way to check it.

Deductions are now two lines, each with its reason:

| Line | Amount | Reason |
|---|---|---|
| **Leave deduction** | Computed | Computed — days, dates, per-day rate |
| **Other deduction** | HR types it | HR types it |

The leave line is read-only. A figure HR can type over is a figure nobody can
trace back to a leave request, and this one is derived from records the
employee can check against their own calendar.

### The leave reason is computed, not written

`describeUnpaidLeave()` builds the sentence from the approved leave records:

```
3 unpaid days at PKR 4,909.09 per day. Unpaid: 28–30 Oct.
```

**No model is involved.** The dates and the rate are the two things an
employee checks first, and a model stating which days somebody was off is
exactly the claim most likely to be wrong — in the one place where being
wrong costs them money. Computing it is both correct and reproducible.

It is stored on the payslip rather than derived on read, because a payslip is
a snapshot: re-deriving it later would describe leave records that may have
been corrected since, against a figure that was frozen months ago.

### A figure without a reason is refused

`bonusReason` and `otherDeductionsReason` are each required when their amount
is above zero, and dropped when it returns to zero — clearing an amount needs
no justification. Both are stored on the payslip **and** in the audit log, so
an employee asking in six months gets the reason that applied at the time.

### Fixed along the way: leave across a month boundary

Unpaid days were counted from the request's stored `days` for every month the
request touched. A week off from 28 Oct to 3 Nov was deducted **in full from
both October and November** — paying for it twice.

Each spell is now clipped to the payroll month and re-counted in working
days, so weekends and holidays inside it are not withheld either. The dates
shown are the first and last day actually withheld, not the clip boundary: a
spell ending on a Saturday the 31st reads as `28–30 Oct`, which agrees with
the three days it charges for.

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


## Employees with no salary set

Self sign-up creates an employee record with `baseSalary: 0` — a salary is
something an administrator decides, not something someone types about
themselves at registration.

Payroll then calculated a perfectly correct zero payslip for them and flagged
it as *"Net pay is zero"*, which is true and useless: it describes the symptom
and not the cause, and the cause is one screen away.

Three changes:

**A distinct flag.** `NO_SALARY` fires when base and allowances are both zero,
and says what to do — *"Set it under Payroll → Salary Structure, then delete
and recalculate this draft."* `ZERO_NET` is now reserved for the genuine
case where deductions consumed a real salary. Both show zero net; only one is
a missing setup step.

**Finalising is blocked.** Issuing a zero payslip locks it as a financial
record for someone who was simply never set up. The button disables with a
tooltip, and a panel names the affected employees with a link to fix it.

**A zero base salary no longer renders as a dash.** A dash means "nothing
here"; zero base pay means "not set". Showing both the same way hid the
problem. Base salary always renders its figure.

The Salary Structure screen highlights the same people, so the problem is
visible before a payroll run is ever started rather than only after.


## Pro-rated payslips must explain themselves

An employee who joins on the 27th is paid for the working days they were
employed, not the whole month:

```
joined 27 Sep       4 of 30 calendar days
                 →  3 of 22 working days
75,000 × 3/22    =  10,227.27 base
10,000 × 3/22    =   1,363.64 allowances
                 =  11,590.91 net
```

That is correct, and it looks exactly like a bug. A base salary of 10,227.27
for someone earning 75,000 is alarming unless the reason is on the screen.

So the run response carries a `proRata` block whenever the joining date falls
inside the month, and the row says it in words:

> Joined 27 Sep 2026 — paid **3 of 22** working days, so base is pro-rated
> from PKR 75,000.00

with a summary line above the table so it is visible without reading every
row.

**The calculation is unchanged.** What changed is that the screen now answers
the question the number provokes. A figure that is right but unexplained costs
the same trust as one that is wrong.


## What an employee does with a payslip

Viewing it is the least of it. Three things people actually need:

| Action | Why |
|---|---|
| **Understand it** | "Why is this amount?" — the report calls for exactly this |
| **Keep a copy** | Landlords, banks and visa applications all ask for payslips |
| **Query it** | If a figure looks wrong, they need to know who to tell |

### "Why is this amount?"

The R&D report specifies this twice — *"the AI can explain payroll results in
understandable language"* (§7.4) and *"Why was my salary lower this month?"*
as an employee example (§8).

The differences between this month and last are **computed by the payroll
service** and handed to the model as facts:

```
Base salary: 120000 → 120000 (0)
Overtime:    18400  → 21702.33 (+3302.33)
Net:         150400 → 153702.33 (+3302.33)
```

The model writes the sentence. It never subtracts — that is rule 2, and a
payslip is where it matters most. The panel closes with a line saying the
figures above are the record and to ask HR if anything looks wrong.

### Download

Browser print rather than a PDF library. "Save as PDF" is in every print
dialog, the output is selectable text instead of an image, and it adds no
dependency.

The print stylesheet does two things that matter. It hides the sidebar,
topbar and buttons so the page is only the payslip. And it **forces light
colours even in dark mode** — a dark-mode payslip prints as a solid black
rectangle, which is the kind of detail nobody notices until someone hands a
landlord a black page.


## The payslip as a document

A payslip is shown to a landlord, a bank or a visa officer. It has to read as
a document issued by a company, not as a screen from an internal tool.

### Anatomy

| Band | Carries |
|---|---|
| **Letterhead** | Logo, company name, address, contact, "PAYSLIP", period, reference number |
| **Identity** | Name, employee code, designation, department, joining date |
| **Period** | Dates covered, payment date, working days, days paid, currency |
| **Figures** | Earnings and deductions in two columns, each with its own subtotal |
| **Net pay** | The figure, and the same amount in words |
| **Footer** | Computer-generated notice, and where to send a query |

Each payslip carries a reference — `PS-202609-0018` — so an employee and HR
can talk about the same document without ambiguity.

### The amount in words

`Rupees One Lakh Fifty-Three Thousand Seven Hundred Two and Thirty-Three
Paisa Only`

Standard on a payslip in this region, and it exists for a reason: a figure
written out is hard to alter after the fact. `numberToWords.ts` uses South
Asian numbering — lakh and crore — because that is how the reader counts.

### Printing

Browser print, not a PDF library. "Save as PDF" is in every print dialog, the
output is selectable text rather than an image, and it costs no dependency.

Three things the stylesheet has to get right:

**Only the payslip that was asked for.** The button marks its own element and
the stylesheet hides the rest — matching on ids would mean the CSS has to
know how many payslips exist.

**A collapsed payslip still prints in full.** The accordion's zero-height row
would otherwise clip it, so the print rules force the grid open for the
target.

**Light colours, always.** A dark-mode payslip prints as a solid black
rectangle. Nobody notices until someone hands it to a landlord.

### Company details

Read from `NEXT_PUBLIC_COMPANY_*` so a deployment sets its own without a code
change. In the multi-tenant version described in
[UI Customization](../17-ui-customization.md) these come from the
organisation settings table instead.
