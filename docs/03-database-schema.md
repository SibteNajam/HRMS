# 03 — Database Schema

MySQL 8 via Prisma. Every table below is deliberately minimal. Two rules were
applied throughout:

1. **Nothing is stored that can be derived.** Attendance percentage, leave
   remaining, dues remaining and hours worked are all computed at query time.
   A stored copy is a copy that can go stale.
2. **Except snapshots.** A payslip stores its numbers permanently, because a
   payslip must show what was paid in March even if the employee's salary
   changed in April. This is the one intentional exception and it is marked.

## Entity relationship overview

```
departments ──< employees ──< attendance
                    │
                    ├──< leave_requests >── leave_types
                    ├──< leave_balances >── leave_types
                    ├──< payslips >── payroll_runs
                    ├──< dues ──< due_payments >── payslips
                    └──1 users ──< notifications
                                └──< ai_conversations ──< ai_messages

job_postings ──< candidates ──< interviews

audit_logs      (references users, no FK — must survive user deletion)
email_log       (standalone)
```

---

## Core

### `departments`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `name` | VARCHAR(100) UNIQUE | |

### `employees`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `employee_code` | VARCHAR(20) UNIQUE | Human-facing, e.g. `EMP-0042` |
| `first_name` | VARCHAR(50) | |
| `last_name` | VARCHAR(50) | |
| `email` | VARCHAR(120) UNIQUE | Work email; also the login identity |
| `phone` | VARCHAR(20) NULL | |
| `department_id` | INT FK → departments | |
| `designation` | VARCHAR(80) | |
| `joining_date` | DATE | |
| `employment_status` | ENUM | `ACTIVE`, `ON_LEAVE`, `RESIGNED`, `TERMINATED` |
| `base_salary` | DECIMAL(12,2) | Current monthly basic |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

Index: `department_id`, `employment_status`.

> `base_salary` is the *current* salary. Historic salary lives on payslips.
> No separate salary-history table — the payslip table already is one.

### `users`

Login credentials, kept separate from `employees` because an ADMIN may not be an
employee, and an employee may exist before their account is created.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `employee_id` | INT FK → employees NULL UNIQUE | NULL for a system admin |
| `email` | VARCHAR(120) UNIQUE | |
| `password_hash` | VARCHAR(255) | bcrypt, cost 12 |
| `role` | ENUM | `EMPLOYEE`, `HR`, `ADMIN` |
| `is_active` | BOOLEAN | Disable login without deleting history |
| `last_login_at` | DATETIME NULL | |
| `created_at` | DATETIME | |

> **No `roles` / `user_roles` tables.** The proposal suggests them, but a
> many-to-many role system is only worth its joins when roles are created at
> runtime. Ours are fixed at three. An ENUM is one column instead of two tables
> and two joins on *every single request*. If you later need runtime-defined
> roles, that is a migration, not a redesign.

---

## Attendance

### `attendance`

One row per employee per day.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `employee_id` | INT FK → employees | |
| `date` | DATE | |
| `check_in` | DATETIME NULL | NULL when absent or on leave |
| `check_out` | DATETIME NULL | NULL when still working or absent |
| `status` | ENUM | `PRESENT`, `ABSENT`, `LATE`, `HALF_DAY`, `ON_LEAVE`, `HOLIDAY` |
| `created_at` | DATETIME | |

Unique: `(employee_id, date)`. Index: `(date)`, `(employee_id, date)`.

**Derived, never stored:**

| Value | Computed as |
|---|---|
| Hours worked | `check_out − check_in` |
| Overtime hours | `max(0, hoursWorked − standardDay)` |
| Attendance % | `count(PRESENT,LATE,HALF_DAY) / count(workingDays) × 100` |
| Late count | `count(status = LATE)` |

There is no `working_hours` or `overtime_hours` column. Both come from the two
timestamps, and a stored version would silently disagree with them the first
time HR corrects a check-out time.

---

## Leave

### `leave_types`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `name` | VARCHAR(50) UNIQUE | Annual, Sick, Casual, Unpaid |
| `annual_quota` | INT | Days per year. `0` = unlimited/unpaid |
| `is_paid` | BOOLEAN | Unpaid leave triggers a payroll deduction |

### `leave_balances`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `employee_id` | INT FK → employees | |
| `leave_type_id` | INT FK → leave_types | |
| `year` | SMALLINT | |
| `allocated` | DECIMAL(4,1) | Usually copied from `annual_quota`, can be overridden per employee |
| `used` | DECIMAL(4,1) | Incremented on approval only |

Unique: `(employee_id, leave_type_id, year)`.

Remaining = `allocated − used`. Not a column.

### `leave_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `employee_id` | INT FK → employees | |
| `leave_type_id` | INT FK → leave_types | |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `days` | DECIMAL(4,1) | Working days, computed on submit and frozen |
| `reason` | TEXT | |
| `status` | ENUM | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `reviewed_by` | INT FK → users NULL | |
| `reviewed_at` | DATETIME NULL | |
| `review_note` | VARCHAR(255) NULL | |
| `created_at` | DATETIME | |

Index: `(status)` — HR's pending queue reads this constantly. Also
`(employee_id, status)`.

> `days` **is** stored, even though it is derivable. If the company's weekend
> configuration changes next year, a request approved under the old calendar
> must not silently change length. Frozen at submit time.

---

## Payroll

### `payroll_runs`

One row per month. Created when HR starts payroll, finalised when they confirm.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `month` | TINYINT | 1–12 |
| `year` | SMALLINT | |
| `status` | ENUM | `DRAFT`, `FINALISED` |
| `processed_by` | INT FK → users NULL | |
| `processed_at` | DATETIME NULL | Set when FINALISED |
| `created_at` | DATETIME | |

Unique: `(month, year)`.

### `payslips`

**This is the snapshot table.** Every figure is stored permanently.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `payroll_run_id` | INT FK → payroll_runs | |
| `employee_id` | INT FK → employees | |
| `base_salary` | DECIMAL(12,2) | As at run time |
| `allowances` | DECIMAL(12,2) | |
| `overtime_amount` | DECIMAL(12,2) | |
| `unpaid_leave_deduction` | DECIMAL(12,2) | |
| `other_deductions` | DECIMAL(12,2) | |
| `dues_deduction` | DECIMAL(12,2) | Installments recovered this month |
| `bonus` | DECIMAL(12,2) | |
| `net_salary` | DECIMAL(12,2) | The stored result of the formula |

Unique: `(payroll_run_id, employee_id)`. Index: `(employee_id)`.

```
net_salary = base_salary + allowances + overtime_amount + bonus
           − unpaid_leave_deduction − other_deductions − dues_deduction
```

`net_salary` is stored rather than computed on read so that a future change to
the formula cannot alter a payslip that has already been issued.

---

## Dues

### `dues`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `employee_id` | INT FK → employees | |
| `type` | ENUM | `LOAN`, `ADVANCE`, `EQUIPMENT`, `OTHER` |
| `description` | VARCHAR(255) | |
| `principal_amount` | DECIMAL(12,2) | Total owed |
| `monthly_installment` | DECIMAL(12,2) | Deducted per payroll run |
| `status` | ENUM | `ACTIVE`, `CLEARED`, `WAIVED` |
| `issued_on` | DATE | |
| `created_at` | DATETIME | |

Index: `(employee_id, status)`.

### `due_payments`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `due_id` | INT FK → dues | |
| `payslip_id` | INT FK → payslips NULL | NULL when paid in cash outside payroll |
| `amount` | DECIMAL(12,2) | |
| `paid_on` | DATE | |

**Derived, never stored:**

| Value | Computed as |
|---|---|
| Paid amount | `SUM(due_payments.amount) WHERE due_id = ?` |
| Remaining | `principal_amount − paidAmount` |

There is no `paid_amount` or `remaining_amount` column on `dues`. Both are a
`SUM` away, and a stored balance that disagrees with its own payment history is
the classic accounting bug.

---

## Communication

### `notifications`

In-app bell icon.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `user_id` | INT FK → users | |
| `type` | ENUM | `LEAVE`, `PAYROLL`, `DUES`, `ATTENDANCE`, `SYSTEM` |
| `title` | VARCHAR(120) | |
| `body` | VARCHAR(500) | |
| `link` | VARCHAR(200) NULL | Frontend route to open on click |
| `is_read` | BOOLEAN | |
| `created_at` | DATETIME | |

Index: `(user_id, is_read)`.

### `email_log`

Every outbound email. Needed for debugging SMTP and for your report's evidence.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `to_email` | VARCHAR(120) | |
| `subject` | VARCHAR(200) | |
| `body` | TEXT | |
| `status` | ENUM | `SENT`, `FAILED` |
| `error` | VARCHAR(500) NULL | |
| `sent_at` | DATETIME | |

---

## AI

### `ai_conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `user_id` | INT FK → users | |
| `title` | VARCHAR(120) | First message, truncated |
| `created_at` | DATETIME | |

### `ai_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `conversation_id` | INT FK → ai_conversations | |
| `role` | ENUM | `USER`, `ASSISTANT` |
| `content` | TEXT | |
| `tools_used` | JSON NULL | Which read tools ran, for the audit trail |
| `created_at` | DATETIME | |

Index: `(conversation_id, created_at)`.

---

## Audit

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK AI | |
| `actor_user_id` | INT | **No FK** — the log must outlive the user |
| `action` | VARCHAR(60) | `LEAVE_APPROVED`, `PAYROLL_FINALISED`, `SALARY_CHANGED` |
| `entity` | VARCHAR(40) | `leave_request`, `employee` |
| `entity_id` | INT | |
| `metadata` | JSON NULL | Before/after values |
| `created_at` | DATETIME | |

Index: `(entity, entity_id)`, `(actor_user_id)`, `(created_at)`.

Written by an interceptor, never by hand. See
[Backend Conventions](05-backend-conventions.md).

---

## Recruitment (optional module)

### `job_postings`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `title` | VARCHAR(120) | |
| `department_id` | INT FK → departments | |
| `description` | TEXT | Pasted JD — the AI reads this directly |
| `status` | ENUM | `OPEN`, `CLOSED` |
| `created_at` | DATETIME | |

### `candidates`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `job_posting_id` | INT FK → job_postings | |
| `name` | VARCHAR(100) | |
| `email` | VARCHAR(120) | |
| `resume_path` | VARCHAR(255) | Local disk path to the stored PDF |
| `match_score` | TINYINT NULL | 0–100, from the AI |
| `match_summary` | JSON NULL | Matched and missing skills |
| `status` | ENUM | `NEW`, `SHORTLISTED`, `INTERVIEW_SCHEDULED`, `REJECTED`, `HIRED` |
| `created_at` | DATETIME | |

Unique: `(job_posting_id, email)` — prevents duplicates when an inbox is polled
twice.

### `interviews`

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AI | |
| `candidate_id` | INT FK → candidates | |
| `scheduled_at` | DATETIME | |
| `mode` | ENUM | `ONSITE`, `ONLINE`, `PHONE` |
| `status` | ENUM | `SCHEDULED`, `COMPLETED`, `CANCELLED` |
| `notes` | TEXT NULL | |

---

## Migrations

The schema in this document is the *design*. The thing that actually creates
tables is a migration, and migrations are the record of how the database got to
its current shape.

```
backend/prisma/
├── schema.prisma                        the model (edit this)
└── migrations/
    ├── migration_lock.toml              records the provider — mysql
    └── 20260927160339_init/
        └── migration.sql                16 CREATE TABLE, 17 foreign keys
```

### Making a change

Never edit a table by hand in MySQL, and never edit an applied migration. Both
put the database out of step with the migration history, and the next person to
run `migrate dev` on a clean machine gets a different schema from yours.

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate + apply a new migration
npx prisma migrate dev --name add_holidays_table
```

Prisma diffs the schema against the migration history, writes a new timestamped
folder with only the `ALTER`/`CREATE` needed, applies it, and regenerates the
client. Commit that folder alongside the schema change.

### Useful commands

| Command | Does |
|---|---|
| `npm run db:migrate` | Create and apply a migration after a schema edit |
| `npx prisma migrate status` | Check the database matches the migration history |
| `npx prisma migrate deploy` | Apply pending migrations without generating — for production |
| `npm run db:reset` | **Drops everything**, re-runs all migrations, re-seeds |
| `npm run db:studio` | Browse the tables in a GUI |
| `npm run db:setup` | First-time setup: create database, migrate, seed |

`db:reset` is destructive and the right tool during development — if a
migration goes wrong, reset rather than patching by hand.

### What belongs in version control

| Committed | Ignored |
|---|---|
| `schema.prisma` | `src/generated/` — regenerated from the schema |
| `migrations/**` | `.env` — contains the JWT secret and database password |
| `seed.ts` | `node_modules/` |
| `.env.example` | |

Committing the generated client produces enormous diffs on every schema change
and adds nothing — any checkout can rebuild it with `npx prisma generate`.

## Seed data

`prisma/seed.ts` must create, or the app cannot be used on a fresh database:

- Departments: Engineering, HR, Sales, Finance, Operations
- Leave types: Annual (14, paid), Sick (10, paid), Casual (6, paid), Unpaid (0, unpaid)
- One ADMIN user
- One HR user
- Five EMPLOYEE users with 60 days of attendance history

The attendance history matters more than it looks. Without it the reports
screens and every AI analytics feature have nothing to display, and you cannot
demo them.
