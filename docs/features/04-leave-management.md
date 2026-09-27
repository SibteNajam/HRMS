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
