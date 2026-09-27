# Feature 07 — AI Chat Assistant

**Depends on:** every module above. Build it last among the core features.
**Contains AI:** this *is* the AI feature.

Read [AI Layer](../09-ai-layer.md) first — it covers the SDK, the guardrails,
the tool loop and cost control. This document covers the feature itself.

## Purpose

A chat panel where anyone can ask HR questions in plain language and get an
answer from their own real data. Employees ask about themselves; HR asks about
the organisation. The same code serves both — the difference is entirely in
which tools the request carries.

## Roles

| Role | Scope | Tools available |
|---|---|---|
| EMPLOYEE | Own records only | 4 self-scoped read tools |
| HR / ADMIN | All employees | Those 4 plus 5 org-wide read tools |

An EMPLOYEE's request to the model **physically does not contain** the org-wide
tools. This is not a filter applied to the answer; the capability is absent from
the request.

## Data

`ai_conversations`, `ai_messages` — see
[Database Schema](../03-database-schema.md#ai).

`ai_messages.tools_used` records which read tools ran for each answer. This is
the audit trail for AI data access, and it is what lets you answer "what did the
assistant look at?" after the fact.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/ai/conversations` | any | Start a conversation |
| GET | `/ai/conversations` | any | Own conversations only |
| GET | `/ai/conversations/:id` | owner | Messages. Ownership checked |
| POST | `/ai/conversations/:id/messages` | owner | Ask. Returns the reply |
| GET | `/ai/conversations/:id/stream` | owner | SSE variant |
| DELETE | `/ai/conversations/:id` | owner | |

Rate limit: 20 messages per minute per user.

## The tools

### Employee-scoped — no `employeeId` parameter exists

| Tool | Returns |
|---|---|
| `get_my_attendance` | Records and summary for a month |
| `get_my_leave_balance` | Balance by type for the current year |
| `get_my_leave_requests` | Own request history and statuses |
| `get_my_payslip` | A payslip, or a comparison of two months |
| `get_my_dues` | Active dues with derived remaining balances |

The employee ID is injected from the JWT at execution time. The model cannot
supply one because the schema has no field for it.

### HR-scoped

| Tool | Returns |
|---|---|
| `search_employees` | Employees by name, department, status |
| `get_attendance_summary` | Percentage, late and absent counts across a range |
| `get_pending_leave_requests` | The approval queue with balances |
| `get_payroll_summary` | A run's totals and flagged payslips |
| `get_outstanding_dues` | All active dues with remaining balances |

## Example questions

These belong in your demo and in your report.

### Employee

| Question | Tools used |
|---|---|
| "How many leaves do I have remaining?" | `get_my_leave_balance` |
| "Why was my salary lower this month?" | `get_my_payslip` ×2 |
| "Do I have any outstanding dues?" | `get_my_dues` |
| "Show my attendance for September" | `get_my_attendance` |
| "How many times was I late this month?" | `get_my_attendance` |
| "When will my loan be cleared?" | `get_my_dues` |

### HR

| Question | Tools used |
|---|---|
| "Show employees with attendance below 80%" | `get_attendance_summary` |
| "Which employees have pending dues?" | `get_outstanding_dues` |
| "How many leave requests are waiting?" | `get_pending_leave_requests` |
| "Summarise this month's attendance problems" | `get_attendance_summary` |
| "Who in Engineering is on leave next week?" | `get_pending_leave_requests`, `search_employees` |
| "Anything unusual in the September payroll?" | `get_payroll_summary` |

Note the last HR question and the second employee question: both require two
tool calls, and the model chains them without being told to. That is the part
worth demonstrating live.

## Behaviour rules

Enforced by the system prompt, and worth stating in your report:

1. **Only answers from tool data.** No general HR knowledge presented as this
   company's policy.
2. **Never calculates.** Reports figures exactly as the tools return them.
3. **Says when it does not know.** "I could not find attendance records for
   that month" beats a confident invention.
4. **Cannot change anything.** Asked to approve leave, it explains where the
   button is.
5. **Concise.** Two or three sentences for a simple question; a table beyond
   three records.
6. **Refuses off-topic questions** politely.

## Frontend

### Two surfaces, one backend

| Surface | Where | Use |
|---|---|---|
| Full page | `/assistant` | Long conversations, history in a left rail |
| Slide-over panel | Global, from the topbar | Quick question without losing your place |

Both call the same endpoints and share the same RTK Query cache.

### Message list

- User messages right-aligned, assistant left
- **Tool activity shown while it happens** — "Checking your attendance…" with
  the tool's friendly name. This is the single most important UI detail in the
  feature: without it, a 3-second wait looks broken; with it, the user sees the
  assistant working and understands where the answer came from.
- Markdown rendered — the model uses tables for lists
- A small "AI-generated" marker on every assistant message
- Copy button

### Suggested prompts

An empty conversation shows four chips, role-appropriate. New users do not know
what to ask, and a blank box gets one bad question and then abandonment.

```tsx
const suggestions = user.role === 'EMPLOYEE'
  ? ['How many leaves do I have left?',
     'Why was my salary different this month?',
     'Show my attendance this month',
     'Do I have any pending dues?']
  : ['Who has attendance below 80%?',
     'How many leave requests are pending?',
     'Summarise this month’s attendance issues',
     'Which employees have outstanding dues?'];
```

### Streaming

Use the SSE endpoint. Render text deltas as they arrive. Between tool calls
there is nothing to display, so emit tool events and show the activity line.

### RTK Query

Chat is an odd fit for RTK Query because the response streams and the cache is
append-only. Use it for the conversation **list** and **history**; handle the
live stream with `EventSource` in the component and append to local state,
invalidating the history tag when the turn completes.

```ts
getConversations: providesTags: [{ type: 'AiConversation', id: 'LIST' }]
getConversation:  providesTags: (r, e, id) => [{ type: 'AiConversation', id }]
sendMessage:      invalidatesTags: (r, e, { id }) => [
                    { type: 'AiConversation', id },
                    { type: 'AiConversation', id: 'LIST' },
                  ]
```

### Failure

If the AI service is down, the panel shows an inline message and a retry button.
The rest of the app is unaffected. Demonstrate this deliberately.

## Manual setup

🔴 `ANTHROPIC_API_KEY` in `.env` — see
[Setup Checklist](../04-setup-checklist.md#2--anthropic-api-key--the-ai).

🔴 `AI_MONTHLY_BUDGET_USD` — set a real ceiling. $10 is generous for this
project.

## Cost

Roughly **$0.015 per question** on `claude-opus-5` (about 1,500 input tokens and
300 output tokens). A full development cycle plus a live demo is a few hundred
questions. Budget $5–10 total.

Three controls are required, not optional:

- 20 messages per minute per user
- Only the last 10 messages of history are resent
- Monthly budget guard that returns 503 when exceeded

The middle one matters most: history is resent on every turn, so a long
conversation costs several times a short one for the same final answer.

## Done when

- [ ] An employee asks about leave balance and gets their real number
- [ ] The same number appears on the Leave screen
- [ ] An employee asks about someone else and is refused
- [ ] An EMPLOYEE request's tool list contains no org-wide tools — verified by logging it
- [ ] HR asks for employees below 80% and gets a correct list
- [ ] A two-step question chains two tool calls
- [ ] "Approve my leave" is refused with an explanation
- [ ] Tool activity is visible while the model works
- [ ] Text streams rather than appearing at once
- [ ] `tools_used` is recorded on every assistant message
- [ ] The rate limit returns 429 on the 21st message in a minute
- [ ] With the key removed, the panel fails gracefully and the app still works
- [ ] There is no AI code path that writes to any HR table
