# Feature 03 — Attendance

**Depends on:** Employees.
**Contains AI:** yes — pattern detection and summaries (read-only).

## Purpose

Record who worked when. Everything downstream — overtime pay, unpaid leave
deductions, attendance reports, the AI's pattern detection — reads this table,
so it must be correct before payroll is built.

## Roles

| Action | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| Check in / out | ✓ (self) | ✓ | ✓ |
| View own records | ✓ | ✓ | ✓ |
| View all records | ✗ | ✓ | ✓ |
| Correct a record | ✗ | ✓ | ✓ |
| Mark absent in bulk | ✗ | ✓ | ✓ |

## Data

`attendance` — see [Database Schema](../03-database-schema.md#attendance).

Nothing derived is stored. Hours, overtime and percentage are all computed from
`check_in` and `check_out` at read time.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/attendance/check-in` | any | No body; employee from JWT |
| POST | `/attendance/check-out` | any | No body |
| GET | `/attendance/me/today` | any | Powers the check-in button state |
| GET | `/attendance/me` | any | `?month=&year=` |
| GET | `/attendance/me/summary` | any | Percentage, late count, overtime |
| GET | `/attendance` | HR, ADMIN | `?date=&departmentId=&status=` |
| GET | `/attendance/summary` | HR, ADMIN | All employees over a range |
| PATCH | `/attendance/:id` | HR, ADMIN | Correct times or status. Audited |
| POST | `/attendance/mark-absent` | HR, ADMIN | Bulk, for a date |

## Business rules

All thresholds come from `.env`. None of them may be hardcoded.

1. **One record per employee per day.** Enforced by a unique constraint, not
   only by a check — two fast clicks must not create two rows.
2. **Check-in twice is a 409**, not a second row.
3. **Check-out without a check-in is a 400.**
4. **Status is derived at check-in:**
   - after `09:00 + LATE_THRESHOLD_MINUTES` → `LATE`
   - otherwise → `PRESENT`
5. **Half day** is set at check-out when hours worked
   `< STANDARD_WORK_HOURS / 2`.
6. **Overtime** = `max(0, hoursWorked − STANDARD_WORK_HOURS)`, computed, never
   stored. Paid at `OVERTIME_RATE_MULTIPLIER × hourlyRate`, where
   `hourlyRate = base_salary / (workingDaysInMonth × STANDARD_WORK_HOURS)`.
7. **Weekends** come from `WEEKEND_DAYS`. A weekend date gets no record at all —
   absence of a row means "not a working day", and it must not count against the
   attendance percentage.
8. **Approved leave writes `ON_LEAVE` rows** for the date range. Those days are
   excluded from the percentage denominator.
9. **A nightly job at 23:55 marks absentees** — every active employee with no
   row for a past working day gets `ABSENT`. Without this, "no row" is
   ambiguous between absent and not-yet-processed, and the reports lie.
10. **Corrections are audited** with the before and after values.

### Attendance percentage

```
workingDays = calendar days in range
            − weekend days
            − holidays
            − approved leave days

attended    = count(PRESENT) + count(LATE) + 0.5 × count(HALF_DAY)

percentage  = attended / workingDays × 100
```

Leave is removed from the denominator. Approved leave is not absence, and
counting it as such would penalise employees for using an entitlement.

## AI involvement

**Read-only. The AI never marks, edits or corrects attendance.**

| Capability | How |
|---|---|
| Answer "how many times was I late this month?" | `get_my_attendance` tool |
| Answer "who is below 80% attendance?" | `get_attendance_summary` tool, HR only |
| Flag repeated lateness | Rules engine finds it, AI writes the description |
| Summarise monthly patterns | AI reads aggregates from the reports module |

### The division of labour

Detection is deterministic. Description is the AI's job.

```ts
// Rules engine — this is what decides something is wrong
const flags = [];
if (lateCount >= 3)            flags.push({ type: 'REPEATED_LATENESS', lateCount });
if (percentage < 80)           flags.push({ type: 'LOW_ATTENDANCE', percentage });
if (percentage < prev - 15)    flags.push({ type: 'DECLINING', from: prev, to: percentage });

// AI — this is what turns it into a sentence HR can act on
"Ali Raza was late 5 times in September, all on Mondays. His attendance fell
 from 94% in August to 78%. Worth a conversation."
```

Thresholds live in code so they are testable and explainable. If the AI decided
what counts as "too late", you could not defend the number to an employee.

## Frontend

### Screens

| Screen | Route | Role |
|---|---|---|
| My attendance | `/attendance` | any |
| Team attendance | `/attendance/team` | HR, ADMIN |
| Daily register | `/attendance/register` | HR, ADMIN |

### My attendance

- A large **Check In / Check Out** button whose state comes from
  `/attendance/me/today`. Before check-in: "Check In". After: "Check Out" with
  the elapsed time. After check-out: today's summary, button disabled.
- A month calendar, one colour per status, using the status style map from
  [Theme Implementation](../07-theming.md#status-styles).
- Four stat cards: percentage, present days, late count, overtime hours.

### Team attendance

Date picker, department filter, a table of every employee's status for that day,
and inline edit for HR.

### RTK Query

```ts
getMyTodayAttendance: providesTags: [{ type: 'Attendance', id: 'TODAY' }]
getMyAttendance:      providesTags: [{ type: 'Attendance', id: 'MY_LIST' }]
getAttendanceSummary: providesTags: [{ type: 'AttendanceSummary', id: 'LIST' }]

checkIn:  invalidatesTags: [{ type: 'Attendance', id: 'TODAY' },
                            { type: 'Attendance', id: 'MY_LIST' }]
checkOut: invalidatesTags: [{ type: 'Attendance', id: 'TODAY' },
                            { type: 'Attendance', id: 'MY_LIST' },
                            { type: 'AttendanceSummary', id: 'LIST' }]
correct:  invalidatesTags: [{ type: 'Attendance', id: 'LIST' },
                            { type: 'AttendanceSummary', id: 'LIST' }]
```

Check-out invalidates the summary because it changes the overtime total.

Poll the daily register at 60 s so HR sees people arriving.

## Manual setup

🔴 Set the policy values in `.env` before the first test:

```bash
STANDARD_WORK_HOURS=8
LATE_THRESHOLD_MINUTES=15
OVERTIME_RATE_MULTIPLIER=1.5
WEEKEND_DAYS=0,6
```

## Done when

- [ ] Check in, then check out, produces one row with both times
- [ ] A second check-in returns 409
- [ ] Check-out without check-in returns 400
- [ ] Arriving after the threshold produces `LATE`
- [ ] Working under half a day produces `HALF_DAY`
- [ ] Overtime is calculated for a long day
- [ ] Weekends produce no rows and do not affect the percentage
- [ ] Approved leave produces `ON_LEAVE` rows excluded from the denominator
- [ ] The nightly job marks absentees
- [ ] A correction is audited
- [ ] The AI reports the same late count as the table
