# Feature 04 — Leave Management

**Depends on:** Employees, Attendance.
**Contains AI:** yes — request summarisation (read-only, advisory).

## Purpose

Employees request leave, HR approves or rejects, balances update. This is the
module that demonstrates the human-in-the-loop principle, so it is the one to
show first in your demo.

## Roles

| Action | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| Submit a request | ✓ | ✓ | ✓ |
| View own requests | ✓ | ✓ | ✓ |
| View own balance | ✓ | ✓ | ✓ |
| View all requests | ✗ | ✓ | ✓ |
| Approve / reject | ✗ | ✓ | ✓ |
| Cancel own pending request | ✓ | ✓ | ✓ |
| Adjust a balance | ✗ | ✗ | ✓ |
| Manage leave types | ✗ | ✗ | ✓ |

## Data

`leave_types`, `leave_balances`, `leave_requests` — see
[Database Schema](../03-database-schema.md#leave).

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/leave/types` | any | For the dropdown |
| GET | `/leave/balance/me` | any | Current year, all types |
| POST | `/leave/requests` | any | Submit |
| GET | `/leave/requests/me` | any | Own history |
| GET | `/leave/requests/pending` | HR, ADMIN | The approval queue |
| GET | `/leave/requests` | HR, ADMIN | All, filterable |
| PATCH | `/leave/requests/:id/review` | HR, ADMIN | Approve or reject. Audited |
| PATCH | `/leave/requests/:id/cancel` | owner, HR | Pending only |
| POST | `/leave/types` | ADMIN | |
| PATCH | `/leave/balance/:id` | ADMIN | Manual adjustment. Audited |

## Approval hierarchy

Who may approve whose leave. The rule that makes it work is not in the table:
**nobody approves their own request**, checked separately — without it an
ADMIN would self-approve, because ADMIN appears in their own approver list.

| Requester | Approved by | Rationale |
|---|---|---|
| `EMPLOYEE` | HR or ADMIN | Day-to-day HR work |
| `HR` | **ADMIN only** | HR cannot approve HR — otherwise two HR staff can approve each other's leave indefinitely |
| `ADMIN` | another ADMIN | Same principle one level up |

```ts
// leave-policy.ts — the single source of truth
export function approversFor(requesterRole: Role): Role[] {
  switch (requesterRole) {
    case Role.EMPLOYEE: return [Role.HR, Role.ADMIN];
    case Role.HR:
    case Role.ADMIN:    return [Role.ADMIN];
  }
}
```

The queue is scoped by the same function, so HR simply never sees a request
they could not action. Showing it and then refusing would be worse than not
showing it.

## Decision factors

Every fact HR needs is on the card, because the alternative is HR opening
another tab — and the conflict with a colleague's leave is exactly what a
human scanning a list misses.

The factors are the ones named in the project documents:

| Factor | Source |
|---|---|
| Leave balance, before and after approval | Report §5, §7.3 — "balances, policy verification" |
| Attendance percentage over 90 days | Report §8 — "attendance below 80%" |
| Repeated lateness | Report §7.2, deck slide 3 |
| Significant decline in attendance | Report §7.2 — "a significant decline in attendance" |
| Reason needs clarification | Deck slide 3 — "identifies missing clarification" |
| Team coverage during the dates | Not in the documents; the highest-value addition |
| Tenure and prior rejections | Context for a borderline call |

### Thresholds

All in `leave-decision-context.ts`, all constants:

| Flag | Fires when |
|---|---|
| `LOW_ATTENDANCE` | below **80%** — the figure the report names |
| `DECLINING_ATTENDANCE` | down more than **15 points** on the previous period |
| `REPEATED_LATENESS` | **3 or more** late arrivals in 90 days |
| `INSUFFICIENT_BALANCE` | approval would take the balance below zero |
| `TEAM_COVERAGE` | **40%+** of the department already off in the range |
| `THIN_REASON` | reason under 25 characters |
| `NEW_JOINER` | under 3 months' tenure |

**Computed by rules, never by the model.** A flag has to be reproducible and
defensible: "attendance below 80%" can be said to an employee's face;
"the AI thought so" cannot. The AI's role here is to describe a set of flags
in a sentence, not to produce them.

When nothing fires, a `CLEAR` flag is emitted deliberately — a queue of cards
with no badges looks like the check failed to run.

## The approvals screen reads as a conclusion, not a dataset

Four metric tiles of equal visual weight make the reader do the judging. HR
opens the queue to answer one question — *can I approve this?* — so the card
answers it first and keeps the numbers underneath.

### Three layers

| Layer | Shows | Always visible |
|---|---|---|
| **Queue summary** | How many are ready, need a look, or are over balance | Yes |
| **Severity rail** | A 3px coloured edge per card | Yes |
| **Verdict line** | The conclusion plus any concerns, in words | Yes |
| **The numbers** | Attendance, lateness, balance, coverage | On click |

The rail makes a queue of twenty scannable without reading a word. The
verdict line means a clear request needs no reading at all — *"Nothing to
flag · attendance 93% · balance 14 → 9 · no team clash"* — and a problem
request states the problem rather than presenting evidence of it.

### Verdicts

| Verdict | When | Effect |
|---|---|---|
| `blocked` | Approving would take the balance below zero | Approve button disabled — the server would refuse anyway |
| `check` | Any danger or warning flag | Concerns listed as bullets |
| `clear` | Nothing fired | One reassurance line |

`blocked` disables the button rather than letting HR click and receive an
error. The service still refuses independently; the disabled button is
courtesy, not the control.

### No attendance history is not 0% attendance

A new joiner has no attendance records. Showing them as **0%** in red is a
false alarm about the most sensitive figure on the card, and it is the kind
of thing that quietly destroys trust in every other number.

`attendance.percentage` is `number | null`. Null renders as `—` with "No
records yet", the low-attendance flag cannot fire, and a separate
`NO_ATTENDANCE_DATA` note explains why there is nothing to judge.

## Dates are UTC-anchored

`new Date('2026-11-16')` parses as UTC midnight, but `setHours(0,0,0,0)`
reinterprets it in local time. In PKT (UTC+5) that lands on
`2026-11-15T19:00Z`, and a MySQL `DATE` column then stores **15 November** —
leave silently on the wrong days, and a working-day count that disagrees with
the attendance rows it writes.

Every date in this module goes through `parseDateOnly()` and uses
`getUTCDay()` / `setUTCDate()`. Never `setHours` on a date-only value.

## Business rules

1. **Dates must be sane** — `start_date <= end_date`, and `start_date` may not
   be more than 30 days in the past.
2. **Days are working days**, weekends and holidays excluded. Computed at submit
   and **stored** on the request, so a later calendar change cannot retroactively
   alter an approved request.
3. **Balance is checked at submit**, and again at approval. The second check is
   not redundant — several pending requests can each fit the balance
   individually while exceeding it together.
4. **No overlapping requests.** A new request touching the dates of an existing
   `PENDING` or `APPROVED` request is rejected.
5. **Approval is a transaction:**
   ```
   UPDATE leave_requests SET status, reviewed_by, reviewed_at, review_note
   UPDATE leave_balances SET used = used + days
   INSERT attendance (ON_LEAVE) for each working day in range
   INSERT notification for the employee
   ```
   All four, or none.
6. **Rejection updates nothing but the request** and the notification. Balance
   untouched.
7. **HR cannot approve their own request.** Checked in the service:
   `if (request.employeeId === reviewer.employeeId) throw new ForbiddenException()`.
8. **Only `PENDING` can be reviewed or cancelled.** Reviewing an already-reviewed
   request is a 400.
9. **Unpaid leave has no balance check** — `annual_quota = 0` means unlimited,
   but each approved day produces a payroll deduction.
10. **Balances roll over on 1 January** via a scheduled job that creates next
    year's rows. Unused days do not carry over.

## AI involvement

**Advisory only. The AI never approves, rejects or cancels anything.**

Two places it contributes:

### On submit — clarity check

The AI reads the reason and flags what is missing. HR sees this on the request
card.

```
"Sick leave, 3 days, no medical note mentioned and no handover named.
 Overlaps the month-end payroll window."
```

### In the queue — a summary of the whole queue

```
"7 pending requests. 3 are from the Engineering team for the same week
 (14–18 Oct), which would leave that team at 40% capacity."
```

That kind of overlap is exactly what a human misses when scanning a list, and
exactly what the AI is good at. It still just says it. HR clicks.

### What the AI is structurally prevented from doing

There is no `approve_leave` tool. There is no AI endpoint that writes. The
approve button calls `PATCH /leave/requests/:id/review` like any other UI
action, with the reviewer taken from the JWT.

## Screens

| Route | Role | Purpose |
|---|---|---|
| `/leave` | all | Balance cards, own request history, cancel a pending one |
| `/leave/new` | all | Submit, with a live working-day and balance preview |
| `/leave/approvals` | HR, ADMIN | The queue, scoped by the approval hierarchy |
| `/leave/all` | HR, ADMIN | Every request, any outcome, with who decided it |
| `/leave/balances` | HR, ADMIN | Entitlement and usage for every active employee |
| `/leave/calendar` | all | Who is off this month, as a timeline |
| `/leave/types` | ADMIN | Leave types and quotas |

### Calendar

A month timeline, one row per person, approved leave drawn as a bar across
the days it spans. Weekends are shaded, today is highlighted, and each leave
type keeps a colour keyed to its id so it never shifts between renders.

**Reasons are deliberately omitted.** Everyone can see who is off — that is
what makes the calendar useful for planning — but "why" is between the
employee and whoever approved it.

### Balances

One row per active employee, one column per quota-bearing type. Unpaid leave
has no quota, so it gets no column rather than an empty one. Remaining turns
amber at two days or fewer.

### Types & policy

Creating a type allocates it to every active employee immediately, pro-rated
for the months left in the year — otherwise the type exists but nobody has a
balance to request against it.

Changing a quota updates this year's allocation, but **only for employees who
have not already used more than the new figure**. Reducing someone below what
they have taken would leave them with a negative balance for leave that was
already approved.

## Frontend

### Screens

| Screen | Route | Role |
|---|---|---|
| My leave | `/leave` | any |
| Request form | `/leave/new` | any |
| Approval queue | `/leave/approvals` | HR, ADMIN |
| All requests | `/leave/all` | HR, ADMIN |

### My leave

Balance cards across the top — one per leave type, showing used and remaining
with a progress bar. Below, a table of own requests with status badges.

### Approval queue

The most important screen in the project. Each card shows:

- Employee name, department, avatar
- Leave type, dates, working-day count
- Their reason
- **Their current balance** — HR should not have to look it up
- The AI summary, visually marked as AI-generated
- Approve and Reject buttons; Reject requires a note

Reject-without-a-reason is disallowed. The employee is told why.

### RTK Query

```ts
getPendingLeaveRequests: providesTags: [{ type: 'LeaveRequest', id: 'PENDING' }]
getMyLeaveRequests:      providesTags: [{ type: 'LeaveRequest', id: 'MY_LIST' }]
getLeaveBalance:         providesTags: [{ type: 'LeaveBalance', id: 'ME' }]

createLeaveRequest: invalidatesTags: [
  { type: 'LeaveRequest', id: 'MY_LIST' },
  { type: 'LeaveRequest', id: 'PENDING' },
]

reviewLeaveRequest: invalidatesTags: (r, e, { id }) => [
  { type: 'LeaveRequest', id },
  { type: 'LeaveRequest', id: 'PENDING' },
  { type: 'LeaveRequest', id: 'MY_LIST' },
  { type: 'LeaveBalance',  id: 'ME' },
  { type: 'Attendance',    id: 'MY_LIST' },   // ON_LEAVE rows were written
]
```

The last two invalidations are the ones people forget. Approval changes the
balance *and* writes attendance rows; miss them and those screens show stale
data.

### Polling

```ts
useGetPendingLeaveRequestsQuery(undefined, {
  pollingInterval: 15000,
  skipPollingIfUnfocused: true,
});
```

Required. Tag invalidation cannot cross browsers — see
[Realtime & Cache Invalidation](../08-realtime-and-cache-invalidation.md).

### Do not use optimistic updates here

Approval can fail server-side (stale balance, already actioned, request
cancelled). Briefly showing "Approved" for something that was not approved is
worse than a 300 ms wait.

## Manual setup

🔴 Seed the leave types before testing. `prisma/seed.ts` creates:

| Name | Annual quota | Paid |
|---|---|---|
| Annual | 14 | Yes |
| Sick | 10 | Yes |
| Casual | 6 | Yes |
| Unpaid | 0 | No |

Adjust to your own organisation's policy if your report specifies one.

## Done when

- [ ] Employee submits, request appears with `PENDING`
- [ ] Balance check rejects an over-quota request with the numbers in the message
- [ ] Overlapping dates are rejected
- [ ] HR's queue shows the request within 15 s without a manual refresh
- [ ] Approve updates status, balance, attendance and notification atomically
- [ ] Killing the process mid-approval leaves no partial state
- [ ] Reject requires a note and leaves the balance untouched
- [ ] HR cannot approve their own request
- [ ] Employee's screen reflects the decision within 30 s
- [ ] The employee receives an email
- [ ] The AI summary appears and is visually marked as AI-generated
- [ ] There is no code path where the AI writes to `leave_requests`
