# 08 — Realtime & Cache Invalidation

This document exists because of a specific question: does HR's screen update
automatically when an employee submits a leave request, via RTK Query tag
invalidation?

**Your flow is correct. The invalidation mechanism is half of what it needs.**

## Your description, checked step by step

> An employee makes a leave request → it goes in the DB through a process → then
> through invalidate tag HR's UI auto shows a new leave request and who made it →
> HR approves or not → DB updates → employee can see it in UI automatically,
> invalidate tag here also → RTK Query will be used → employee gets to know
> whether approved or not

| Step | Verdict |
|---|---|
| Employee submits → validated → written to DB | ✅ Correct |
| Employee's own list updates via `invalidatesTags` | ✅ Correct |
| **HR's screen auto-shows the new request via invalidate tag** | ❌ **This is the gap** |
| HR approves → DB + balance update in a transaction | ✅ Correct |
| HR's own list updates via `invalidatesTags` | ✅ Correct |
| **Employee's screen auto-shows the decision via invalidate tag** | ❌ **Same gap** |
| Employee is notified of the outcome | ✅ Correct — via notification + email |

Two of the seven steps do not work the way you expect, and they are the same
problem seen from both sides.

## Why

RTK Query's cache lives in a Redux store. A Redux store lives in **one browser
tab**. `invalidatesTags` dispatches an action into that store.

When the employee's browser POSTs the leave request:

```
Employee's browser                    HR's browser
──────────────────                    ────────────
POST /leave/requests
      │
      ▼
   200 OK
      │
      ▼
invalidatesTags fires
      │
      ▼
refetch employee's list               (nothing. no connection. no idea
      │                                anything happened. still showing
      ▼                                the list from 10 minutes ago.)
UI updates ✅
```

HR's browser was never told. Nothing reached it. Invalidation cannot cross a
network boundary it has no connection over — that is not a limitation of RTK
Query, it is what "cache invalidation" means.

## The two ways to close it

### Option A — Polling (use this)

Tell the query to refetch itself on an interval. One extra line.

```ts
const { data: pending } = useGetPendingLeaveRequestsQuery(undefined, {
  pollingInterval: 15000,       // refetch every 15s while mounted
  skipPollingIfUnfocused: true, // pause when the tab is in the background
});
```

HR sees the request within 15 seconds. `skipPollingIfUnfocused` means a tab left
open overnight makes no requests.

**Where to poll:**

| Screen | Interval | Why |
|---|---|---|
| HR pending leave queue | 15 s | Someone is waiting on it |
| Notification bell | 30 s | Covers every module |
| Employee's own request list | 30 s | To see the decision |
| Payroll run status | 10 s | Only while a run is processing |
| Everything else | none | Refetch on mount and on window focus is enough |

Also turn on the global listeners — they give you most of the benefit for free:

```ts
setupListeners(store.dispatch);   // already in app/store.ts
```

```ts
export const baseApi = createApi({
  refetchOnFocus: true,        // user switches back to the tab → refetch
  refetchOnReconnect: true,    // network comes back → refetch
  ...
});
```

In practice `refetchOnFocus` handles a large share of real usage: HR tabs away
to read an email, comes back, and the list is current.

### Option B — WebSocket

A NestJS gateway pushes an event; the client invalidates the tag on receipt.
Genuinely instant, and roughly 200 lines of extra code across both sides — a
gateway, room membership by user and role, a JWT handshake, an auth guard on the
socket, reconnection handling, and a client listener.

```ts
// Backend — after a leave request is created
this.events.toRole('HR', 'leave.created', { id: request.id });

// Frontend — one listener that translates events into invalidations
socket.on('leave.created', () => {
  dispatch(baseApi.util.invalidateTags([{ type: 'LeaveRequest', id: 'PENDING' }]));
});
```

Note the shape: the socket carries **no data**, only "something changed". The
client then refetches through the normal endpoint, so authorisation is enforced
exactly once, in the HTTP layer. Never push record data down a socket — you would
have to re-implement RBAC in the gateway.

### Recommendation

**Use polling.** For an organisation of this size, a 15-second delay on a leave
approval is invisible to users and indistinguishable in a demo. Polling is one
line per screen; WebSockets are a subsystem with its own failure modes, and
debugging a socket that silently drops in the middle of your presentation is not
how you want to spend that afternoon.

Write the WebSocket design into your report's *Future Enhancements* section. It
is the right long-term answer, and saying so demonstrates you understood the
tradeoff rather than missed it.

## The complete leave flow, corrected

```
EMPLOYEE TAB                   BACKEND                    HR TAB
     │                            │                          │
     │ POST /leave/requests       │                          │
     ├───────────────────────────►│                          │
     │                     validate DTO                      │
     │                     check balance                     │
     │                     check overlap                     │
     │                     INSERT PENDING                    │
     │                     notify HR (db row)                │
     │◄───────────────────────────┤                          │
     │ 201                        │                          │
     │                            │                          │
 invalidatesTags:                 │                          │
  LeaveRequest/MY_LIST            │                          │
     │                            │      ⏱ poll 15s          │
     │                            │◄─────────────────────────┤
     │                            │  GET /requests/pending   │
     │                            ├─────────────────────────►│
     │                            │        request appears ✅ │
     │                            │                          │
     │                            │   PATCH /:id/review      │
     │                            │◄─────────────────────────┤
     │                    ┌───── transaction ─────┐          │
     │                    │ UPDATE request        │          │
     │                    │ UPDATE balance.used   │          │
     │                    │ INSERT notification   │          │
     │                    └───────────────────────┘          │
     │                     queue email                       │
     │                            ├─────────────────────────►│
     │                            │  200                     │
     │                            │                          │
     │                            │              invalidatesTags:
     │                            │               LeaveRequest/PENDING
     │                            │               LeaveRequest/:id
     │                            │                          │
     │      ⏱ poll 30s            │                          │
     ├───────────────────────────►│                          │
     │ status = APPROVED ✅        │                          │
     │                            │                          │
     │ 🔔 notification + 📧 email  │                          │
```

Three independent paths tell the employee the outcome: the polled list, the
notification bell, and the email. Any one of them can fail and the employee
still finds out. That redundancy is deliberate — build all three.

## Optimistic updates — do not

RTK Query supports updating the cache before the server responds. It is
tempting for the approve button.

Do not use it here. If the server rejects the approval — stale balance, the
request was cancelled, someone else already actioned it — you have to roll the
UI back, and for a moment HR saw "Approved" for a request that was not. In a
payroll and leave system, briefly showing the wrong state is worse than a
300 ms wait.

Optimistic updates are appropriate for marking a notification read. That is the
only place in this project where a wrong guess costs nothing.

## Testing the flow

Two browsers, not two tabs — you want genuinely separate sessions.

1. Chrome normal window: log in as `ali@hrai.local`.
2. Chrome incognito: log in as `hr@hrai.local`, open the Leave queue.
3. Submit a request as the employee.
4. Watch the HR window. It must show the request within 15 seconds without a
   manual refresh. If you have to press F5, polling is not configured on that
   screen.
5. Approve it in the HR window.
6. Watch the employee window. Status must flip to APPROVED within 30 seconds,
   and the leave balance must drop.
7. Check `email_log` for the outbound message.

This is also your demo script. Rehearse it.
