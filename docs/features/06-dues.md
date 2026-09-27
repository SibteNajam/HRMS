# Feature 06 — Dues Management

**Depends on:** Employees. Integrates with Payroll.
**Contains AI:** yes — queries and reminder drafts (read-only).

## Purpose

Track what employees owe the company — loans, salary advances, equipment
charges — and recover it automatically through monthly payroll deductions.

## Roles

| Action | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| View own dues | ✓ | ✓ | ✓ |
| View all dues | ✗ | ✓ | ✓ |
| Create a due | ✗ | ✓ | ✓ |
| Record a manual payment | ✗ | ✓ | ✓ |
| Waive a due | ✗ | ✗ | ✓ |

Waiving writes off money. ADMIN only, always audited.

## Data

`dues`, `due_payments` — see
[Database Schema](../03-database-schema.md#dues).

**No `paid_amount` or `remaining_amount` column exists.** Both are derived:

```sql
paidAmount = SELECT COALESCE(SUM(amount), 0) FROM due_payments WHERE due_id = ?
remaining  = principal_amount - paidAmount
```

A stored balance that disagrees with its own payment history is the classic
accounting bug, and it is unfixable once it happens because you no longer know
which number is right.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/dues/me` | any | Own dues with derived balances |
| GET | `/dues` | HR, ADMIN | `?employeeId=&status=&type=` |
| GET | `/dues/:id` | owner, HR | Includes payment history |
| POST | `/dues` | HR, ADMIN | Audited |
| POST | `/dues/:id/payments` | HR, ADMIN | Manual cash payment |
| PATCH | `/dues/:id/waive` | ADMIN | Audited |
| GET | `/dues/outstanding-summary` | HR, ADMIN | Totals for the dashboard |

## Business rules

1. **Principal must be greater than zero.**
2. **Monthly installment must be greater than zero and at most the principal.**
3. **Recovery happens at payroll finalisation.** For each `ACTIVE` due:
   ```
   installment = min(monthly_installment, remaining)
   ```
   Never deduct more than is owed.
4. **Net salary may not go below zero.** If the total of all installments would
   push it negative, deduct only what fits and log the shortfall. The rest is
   recovered next month.
5. **Priority when several dues exist**: oldest `issued_on` first.
6. **A due becomes `CLEARED`** automatically when `remaining = 0`, in the same
   transaction as the payment that cleared it.
7. **A `WAIVED` due is excluded from recovery** but stays in the table. Waiving
   is never a delete — the record is the evidence that it was written off, and
   by whom.
8. **Manual payments** (employee paid in cash) create a `due_payments` row with
   `payslip_id = NULL`. This is why that column is nullable.
9. **A due cannot be deleted.** Waive it instead.

## AI involvement

**Read-only.**

| Capability | How |
|---|---|
| "Do I have any outstanding dues?" | `get_my_dues` tool |
| "How long until my loan is cleared?" | Reads installment and remaining; states the count |
| "Which employees have pending dues?" | `get_outstanding_dues`, HR only |
| Draft a reminder email | Generates the body; HR reviews and sends |

### The arithmetic boundary

Even "how many months remain" is `ceil(remaining / installment)` — computed by
the service and handed to the model as a number. The model reports it; it does
not divide.

This looks pedantic for a single division. It is not: the moment you allow the
model to do "easy" arithmetic, you have no line to point at when someone asks
which numbers in the system are guaranteed.

### Reminder drafts

```
Subject: Reminder — outstanding loan balance

Dear Ahmed,

This is a reminder that PKR 24,000 remains on the equipment loan issued on
12 March 2025. At the current installment of PKR 4,000 per month, the balance
will be cleared in 6 months. The next deduction will appear on your
October payslip.

Regards,
HR Department
```

The AI writes it. HR reads it, edits if needed, presses send. Never automatic —
a wrongly-addressed debt reminder is a real problem with a real person.

## Frontend

### Screens

| Screen | Route | Role |
|---|---|---|
| My dues | `/dues` | any |
| All dues | `/dues/all` | HR, ADMIN |
| Due detail | `/dues/:id` | owner, HR |
| Create due | `/dues/new` | HR, ADMIN |

### My dues

One card per active due: type, description, a progress bar of paid against
principal, remaining in large text, monthly installment, projected clear-by
month. Below, the full payment history with the payslip each deduction came
from.

The progress bar matters. "PKR 24,000 remaining" means little on its own;
"PKR 16,000 of PKR 40,000 repaid" is immediately understandable.

### All dues

Table with employee, type, principal, paid, remaining, installment, status.
Filter by status and type. A summary strip at the top: total outstanding, number
of active dues, total recovered this month.

### RTK Query

```ts
getMyDues:      providesTags: [{ type: 'Due', id: 'MY_LIST' }]
getAllDues:     providesTags: [{ type: 'Due', id: 'LIST' }]
getDue:         providesTags: (r, e, id) => [{ type: 'Due', id }]

createDue:      invalidatesTags: [{ type: 'Due', id: 'LIST' }]
recordPayment:  invalidatesTags: (r, e, { dueId }) => [
                  { type: 'Due', id: dueId },
                  { type: 'Due', id: 'LIST' },
                  { type: 'Due', id: 'MY_LIST' },
                ]
waiveDue:       invalidatesTags: (r, e, { id }) => [
                  { type: 'Due', id }, { type: 'Due', id: 'LIST' },
                ]
```

Payroll finalisation also invalidates `{ type: 'Due', id: 'LIST' }` — see
[Payroll](05-payroll.md).

## Manual setup

None.

## Done when

- [ ] HR creates a loan; it appears for the employee with the correct remaining
- [ ] Finalising payroll deducts one installment and creates a `due_payments` row
- [ ] The payslip's `dues_deduction` matches the installment exactly
- [ ] The final installment is capped at the remaining balance, not the full amount
- [ ] The due flips to `CLEARED` automatically on full repayment
- [ ] Two dues on one employee are recovered oldest-first
- [ ] Net salary never goes negative; the shortfall carries forward
- [ ] A manual cash payment records with `payslip_id = NULL`
- [ ] Waiving stops recovery, keeps the record, and is audited
- [ ] HR gets 403 on waive
- [ ] Remaining always equals principal minus the sum of payments
- [ ] The AI reports the same remaining balance as the screen
