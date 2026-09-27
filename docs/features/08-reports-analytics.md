# Feature 08 — Reports & Analytics

**Depends on:** Attendance, Leave, Payroll, Dues.
**Contains AI:** yes — written summaries over computed aggregates.

## Purpose

Turn the accumulated data into something HR can act on: dashboards, trends,
anomaly flags, and a written summary of what the numbers mean.

## Roles

HR and ADMIN only. Employees get personal statistics on their own screens, not
a reports section.

## Data

No new tables. Every report is an aggregation over existing ones.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/reports/dashboard` | Headline figures for the HR landing page |
| GET | `/reports/attendance` | Per-employee summary over a range |
| GET | `/reports/attendance/trends` | Monthly percentage over time |
| GET | `/reports/leave` | Leave taken by type and department |
| GET | `/reports/payroll` | Cost by month and department |
| GET | `/reports/dues` | Outstanding totals and ageing |
| GET | `/reports/anomalies` | Everything the rules engine flagged |
| POST | `/reports/summary` | AI narrative over a chosen report |

All accept `startDate`, `endDate` and optional `departmentId`.

## Dashboard figures

The HR landing page. Six numbers, chosen because each one implies an action.

| Figure | Query |
|---|---|
| Present today | `COUNT(attendance WHERE date = today AND status IN (PRESENT, LATE))` |
| Absent today | Active employees − present − on leave |
| On leave today | `COUNT(attendance WHERE date = today AND status = ON_LEAVE)` |
| Pending leave requests | `COUNT(leave_requests WHERE status = PENDING)` |
| Outstanding dues | `SUM(principal) − SUM(payments)` over active dues |
| This month's payroll | `SUM(net_salary)` for the latest finalised run |

## Anomaly detection

**Deterministic. The rules engine finds them; the AI describes them.**

```ts
export const ANOMALY_RULES = {
  REPEATED_LATENESS:    (e) => e.lateCount >= 3,
  LOW_ATTENDANCE:       (e) => e.attendancePercentage < 80,
  DECLINING_ATTENDANCE: (e) => e.prevPercentage - e.attendancePercentage > 15,
  EXCESSIVE_OVERTIME:   (e) => e.overtimeHours > 40,
  LARGE_SALARY_CHANGE:  (e) => Math.abs(e.net - e.prevNet) / e.prevNet > 0.20,
  HIGH_DEDUCTIONS:      (e) => e.deductions > e.gross * 0.5,
  OVERDUE_DUES:         (e) => e.monthsSinceLastPayment > 2,
  LEAVE_CLUSTERING:     (d) => d.onLeaveSameWeek / d.teamSize > 0.4,
};
```

Every threshold is a constant you can point at and defend. If HR asks why
someone was flagged, the answer is a number in a config file — not "the model
thought so".

### Why not let the AI detect anomalies

Three reasons, all of which belong in your report:

1. **Reproducibility.** The same data must flag the same people every time.
2. **Explainability.** "Attendance below 80%" is defensible in a disciplinary
   conversation. "The AI noticed something" is not.
3. **Cost.** Sending every employee's full history to a model monthly is
   expensive and slow. A SQL query is neither.

The AI's contribution is real but different: it takes a list of flags and writes
the paragraph a manager actually reads.

## AI involvement

```ts
POST /reports/summary
{ reportType: 'attendance', startDate: '2025-09-01', endDate: '2025-09-30' }
```

The service computes the aggregates, passes them to the model as tool output,
and asks for a narrative.

```
"September attendance averaged 87%, down from 91% in August. The decline is
 concentrated in Sales, where three employees fell below 80%. Company-wide
 lateness rose from 12 to 19 instances, over half of them on Mondays.
 Engineering was stable at 94%.

 Worth attention: Ahmed Khan dropped from 92% to 71% with no approved leave —
 the sharpest individual change this month."
```

The model receives only computed numbers. It never sees raw rows and never
aggregates anything itself.

## Frontend

### Screens

| Screen | Route |
|---|---|
| Dashboard | `/` (HR landing) |
| Attendance report | `/reports/attendance` |
| Leave report | `/reports/leave` |
| Payroll report | `/reports/payroll` |
| Dues report | `/reports/dues` |

### Charts

Recharts. Four charts, no more — a dashboard of twelve charts is a dashboard
nobody reads.

| Chart | Type | Shows |
|---|---|---|
| Attendance trend | Line | Monthly percentage, last 6 months |
| Department comparison | Bar | Attendance percentage by department |
| Leave distribution | Donut | Days taken by leave type |
| Payroll cost | Stacked bar | Base, overtime, deductions by month |

Charts must read theme colours through the `cssVar` helper and remount on theme
change — see [Data Visualization](../16-data-visualization.md#5-implementation).
Colours, chart forms and the validated palettes are specified there; do not pick
chart colours ad hoc.

### Anomaly panel

A card list. Each anomaly shows the employee, the rule that fired, the actual
number, and a link to their detail page. A button at the top generates the AI
summary of the whole set.

### Export

CSV from any report table. Build it server-side and stream it — do not assemble
a large CSV in the browser.

### RTK Query

```ts
getDashboard:        providesTags: [{ type: 'Report', id: 'DASHBOARD' }]
getAttendanceReport: providesTags: [{ type: 'Report', id: 'ATTENDANCE' }]
getAnomalies:        providesTags: [{ type: 'Report', id: 'ANOMALIES' }]
```

Reports are read-only, so nothing invalidates them directly. Instead:

```ts
keepUnusedDataFor: 300,   // 5 minutes — aggregates do not change by the second
```

Poll the dashboard at 60 s so "present today" stays current during the working
day.

## Performance

These are the only queries in the project that can get slow.

- Aggregate in **SQL**, never in JavaScript. Do not fetch 10,000 attendance rows
  and `reduce` them.
- Indexes required: `attendance(date)`, `attendance(employee_id, date)`,
  `leave_requests(status)`, `payslips(employee_id)`.
- Use `$queryRaw` with the **tagged template** for complex aggregation.
  `$queryRawUnsafe` must not appear in the codebase.
- Cache the dashboard for 60 s in memory. It is hit on every HR page load.

## Manual setup

None. But the reports are empty without data — the seed script must create 60
days of attendance history or every chart on every screen is blank and you
cannot demo this module.

## Done when

- [ ] Dashboard figures match hand-counted values in the seeded data
- [ ] Attendance percentages match the Attendance screen exactly
- [ ] Every anomaly rule fires on a deliberately seeded case
- [ ] No anomaly is produced by the model
- [ ] Charts are readable in both light and dark themes
- [ ] Charts re-colour when the theme is switched
- [ ] CSV export opens correctly in Excel
- [ ] The AI summary states only numbers present in the aggregates
- [ ] The attendance report over 60 days returns in under a second
- [ ] `$queryRawUnsafe` appears nowhere
