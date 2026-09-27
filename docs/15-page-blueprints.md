# 15 — Page Blueprints

What goes on every screen, in what order, and why. This is the answer to "what
should this page show" so nobody has to invent a layout under deadline.

> **The rule for every page:** the most important information is in the top-left
> quadrant, above the fold, without interaction. Eyes land there first. If the
> user has to scroll or click to learn the one thing the page exists to tell
> them, the page is laid out wrong.

---

## Dashboard — HR / ADMIN

`/` · The first screen after login. It must answer "does anything need me today?"
in under three seconds.

```
Good morning, Ahmed                              [ Run Payroll ]
Thursday, 27 September

┌──────────┬──────────┬──────────┬──────────┐
│ PRESENT  │ ON LEAVE │ PENDING  │ PAYROLL  │
│   142    │    8     │    3     │  4.2M    │
│ ↑ 3.2%   │          │ approvals│  Sept    │
└──────────┴──────────┴──────────┴──────────┘

┌─────────────────────────────┬──────────────────────┐
│ Attendance trend  (6 mo)    │ ✦ AI Briefing        │
│ ╱╲    line chart            │ Attendance fell 4%   │
│                             │ this month, mostly   │
├─────────────────────────────┤ in Sales. Three      │
│ By department   bar chart   │ employees are below  │
│ ████████ Engineering  94%   │ 80%…                 │
│ ██████   Sales        78%   ├──────────────────────┤
└─────────────────────────────┤ Needs attention  (4) │
                              │ • 3 leave approvals  │
┌─────────────────────────────┤ • 1 payroll anomaly  │
│ Recent activity             │ • 2 overdue dues     │
└─────────────────────────────┴──────────────────────┘
```

| Region | Contents |
|---|---|
| Greeting | Name + date. `h1` + `body-sm`. Warm, not decorative |
| Primary action | The one thing due now — "Run Payroll" at month end, otherwise "Add Employee" |
| Stat row | Present today · On leave · Pending approvals · This month's payroll |
| Attendance trend | Line, 6 months, single series |
| Department comparison | Horizontal bar, sorted descending |
| AI briefing | `AiCallout`, 3–4 sentences over this month's aggregates |
| Needs attention | Grouped action list, each row deep-links to its screen |
| Recent activity | Last 10 audit entries, avatar + action + relative time |

**Four stats, not eight.** A dashboard of twelve numbers gets scanned as
decoration. Four gets read.

---

## Dashboard — EMPLOYEE

Same shell, entirely different content. Their question is "what is my status?"

| Region | Contents |
|---|---|
| Check-in card | Large `Check In` / `Check Out` button, today's status, elapsed time. **Top-left — it is the most-used control in the product** |
| Stat row | Attendance % · Leave remaining · Next payday · Outstanding dues |
| My leave | Balance bars per type |
| Recent payslip | Net salary, month, "View" link |
| Announcements | HR notices, if any |

---

## Employees

`/employees` · Stat row + table.

Stats: Total active · New this month · On leave today · Departments.

Toolbar above the table: search (360px, `Search` adornment, 300ms debounce),
department select, status select, `ListFilter` for advanced, `Download` export,
and `+ Add Employee` as the primary.

| Column | Alignment | Notes |
|---|---|---|
| Employee | left | Avatar + name over `employee_code` in `caption` |
| Department | left | |
| Designation | left | |
| Joining date | left | `12 Mar 2023` — never `2023-03-12` |
| Status | left | Badge |
| Salary | **right** | HR/ADMIN only, `tabular-nums` |
| Actions | right | `⋯` menu |

Row click opens `/employees/:id`. Destructive actions live only in the menu.

### Employee detail

Split layout. Left 60%: tabs — Profile · Attendance · Leave · Payroll · Dues,
each fetching on first open. Right 40%, sticky: avatar card, key facts, quick
actions, and an "Ask AI about this employee" button for HR.

---

## Attendance

### My Attendance `/attendance`

```
┌──────────────────────────────────────┐
│  ◷  You checked in at 09:04          │  ← brand-50 card, radius-xl
│     Working for 6h 22m               │
│                   [ Check Out ]      │
└──────────────────────────────────────┘

┌──────┬──────┬──────┬──────┐
│ 94%  │  18  │  2   │ 6.5h │
│ Rate │Present│ Late │ OT   │
└──────┴──────┴──────┴──────┘

     September 2025          ‹  ›
  Mo Tu We Th Fr Sa Su
   1  2  3  4  5  ·  ·        ● present
   8  9 10 11 12  ·  ·        ● late
  15 16 17 18 19  ·  ·        ● absent
```

The calendar uses status colours as **filled dots under the date**, not as cell
backgrounds. A grid of coloured blocks is loud and unreadable at a glance; dots
keep the dates legible.

Below: a detail table of the selected month.

### Daily Register `/attendance/register` — HR

Date picker + department filter. Live counts. A table of every employee with
their status for that day, inline-editable by HR. Polls at 60s.

---

## Leave

### My Leave `/leave`

Balance cards first — one per leave type, showing a progress bar of used against
allocated, remaining as the large figure, and a "Request" action.

Then a table of own requests: type, dates, days, status badge, submitted date,
and — critically — the **HR note on any rejected request**. An employee who is
rejected must see why without clicking.

### Approvals `/leave/approvals` — HR

**The most important screen in the product.** Card list, not a table — each
decision needs context that a row cannot hold.

```
┌────────────────────────────────────────────────────┐
│ (AR) Ahmed Raza                    ⏱ 2 days ago    │
│      Engineering · Senior Developer                │
│                                                    │
│ Annual Leave    14–18 Oct 2025    5 working days   │
│                                                    │
│ "Family wedding in Lahore, travelling 13th."       │
│                                                    │
│ Balance: 9 of 14 remaining  →  4 after approval    │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │ ✦ 3 others in Engineering are off that week.   │ │
│ │   No handover named in the request.            │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│                      [ Reject ]  [ Approve ]       │
└────────────────────────────────────────────────────┘
```

Every fact needed to decide is on the card. **Balance before and after** is the
single most valuable element — without it HR opens another tab to check, and the
AI conflict note is what a human scanning a list reliably misses.

Reject opens a modal requiring a note. Approve is immediate with an undo toast
for 5 seconds.

Polls at 15s. See
[Realtime & Cache Invalidation](08-realtime-and-cache-invalidation.md).

### Leave Calendar `/leave/calendar`

Month grid, one row per employee, approved leave as a rounded bar spanning its
dates, coloured by leave type. Immediately shows coverage gaps.

---

## Payroll

### My Payslips `/payroll`

Table of months with net salary and a download action. Clicking opens the
payslip.

### Payslip detail

```
        September 2025 Payslip
        Ahmed Raza · EMP-0042

        NET SALARY
        PKR 47,320                    ← display-lg, tabular

┌──────────────────────┬──────────────────────┐
│ EARNINGS             │ DEDUCTIONS           │
│ Basic      45,000.00 │ Unpaid leave    0.00 │
│ Allowances  5,000.00 │ Loan        4,000.00 │
│ Overtime    1,320.00 │ Other           0.00 │
│ ─────────────────────│ ─────────────────────│
│ Gross      51,320.00 │ Total       4,000.00 │
└──────────────────────┴──────────────────────┘

[ ✦ Explain this payslip ]        [ ⤓ Download PDF ]
```

Two columns, earnings left and deductions right, both right-aligned and tabular.
Net at the top in display size — it is the number the employee opened this page
for, so it does not go at the bottom.

"Explain this payslip" opens the AI slide-over comparing with last month.

### Payroll Runs `/payroll/runs` — HR

List of monthly runs with status badges. Draft rows show a "Review" action;
finalised rows show "View".

### Run review `/payroll/runs/:id`

The AI anomaly panel sits **above** the table — HR must see the three flagged
payslips before scrolling through 142 rows.

Table: employee, base, allowances, overtime, deductions, dues, net. Flagged rows
get a `warning-subtle` background and a left accent bar. Editable while DRAFT.

The **Finalise** button is ADMIN-only and opens a confirmation stating the
employee count, the total payout, and that the action is irreversible.

---

## Dues

### My Dues `/dues`

One card per active due:

```
┌──────────────────────────────────────┐
│ ▤ Equipment Loan          [ Active ] │
│   Issued 12 Mar 2025                 │
│                                      │
│   ████████████░░░░░░░░  40%          │
│   PKR 16,000 of 40,000 repaid        │
│                                      │
│   Remaining     PKR 24,000           │
│   Monthly       PKR  4,000           │
│   Clears        March 2026           │
└──────────────────────────────────────┘
```

The progress bar carries the meaning. "PKR 24,000 remaining" alone means little;
"16,000 of 40,000 repaid, clears in March" is instantly understood.

Payment history below, each row linking to the payslip it came from.

---

## AI Assistant

`/assistant` · Two-column: 280px conversation history rail, chat thread right.

Empty state shows four role-appropriate suggestion chips. A blank input box gets
one bad question and then abandonment.

Thread: user messages right in `brand-600`, assistant left in `surface-sunken`,
markdown rendered, tables supported. `ToolActivity` shows while the model reads
data. Text streams. Every assistant message carries a `Sparkles` marker and a
copy button.

Composer pinned to the bottom: textarea auto-growing to 5 lines, `Enter` sends,
`Shift+Enter` newlines, send button disabled while empty or streaming.

The same thread is available as a global slide-over from the topbar, so a
question never costs you your place.

---

## Reports

Shared shell: date-range picker and department filter in **one row above the
charts**, never scattered per card.

| Report | Contents |
|---|---|
| Attendance | Trend line · department bars · distribution donut · per-employee table |
| Leave | Days by type donut · monthly bars · balance table |
| Payroll | Cost stacked bars · department split · month-over-month table |
| Dues | Outstanding total · ageing bars · per-employee table |
| Anomalies | AI summary, then a grouped card list per rule |

Every report has an export action and an "AI summary" button.

---

## Settings

Sidebar sub-navigation, content right. Each page is a single column capped at
720px — full-width form fields on a 1440px screen look broken.

| Page | Contents |
|---|---|
| My Profile | Own details, change password |
| Appearance | Theme (light/dark/system), density, sidebar default |
| Users & Roles | ADMIN. User table, role change, deactivate |
| Email Templates | ADMIN. Template editor with preview |
| Audit Log | ADMIN. Filterable table, expandable metadata rows |
| Organisation | ADMIN. Name, logo, brand colour, currency, work week, thresholds |

---

## Login

Split screen. Left 45%: `brand-600` panel with the logo, a one-line value
statement, and a subtle geometric pattern at 8% white. Right 55%: the form on
`surface-page`, centred, 400px wide.

Form: email, password with a reveal toggle, "Forgot password?", and a full-width
`lg` primary button. Errors appear above the form in a `danger-subtle` callout,
never as a toast — a toast that auto-dismisses is the wrong place for a login
failure.

Theme toggle in the top-right corner. It is the first thing a user sees, and it
should already look like their environment.

---

## Cross-cutting rules

### Dates and numbers

| Kind | Format |
|---|---|
| Date | `12 Mar 2025` |
| Date + time | `12 Mar 2025, 09:04` |
| Relative | `2 hours ago` — under 7 days, then absolute |
| Currency | `PKR 47,320.00` — tabular, right-aligned |
| Percentage | `94.2%` — one decimal |
| Duration | `6h 22m` |

Never `2025-03-12` in the UI. ISO is a storage format, not a reading format.

### Density

A `comfortable` / `compact` toggle in Appearance switches table row height
between 52px and 44px and card padding between 24px and 16px. HR staff working
through 140 rows want compact; occasional users want comfortable.

### Every page

- [ ] `PageHeader` with title and subtitle
- [ ] Loading skeleton shaped like the real content
- [ ] Error state with retry
- [ ] Empty state with specific copy and an action
- [ ] The key information above the fold, top-left
- [ ] At most one primary button
- [ ] Works at 1280px and 1920px
- [ ] Checked in both themes
