# 00 — Project Overview

## What we are building

A web application that runs a small organisation's HR department. Employees log
in to mark attendance, request leave, view payslips and check what they owe. HR
logs in to manage people, approve requests, run payroll and see reports. On top
of that sits an AI layer that answers questions in plain language, explains
numbers, spots unusual patterns and drafts emails.

## The three rules that govern every decision

These are not suggestions. Every feature doc is written to obey them, and if a
design choice ever seems ambiguous, resolve it with these.

### Rule 1 — The AI never calculates money or policy

Salary, leave balance, overtime, deductions and dues are computed by plain
TypeScript functions with unit tests. The AI is allowed to *read* the result and
explain it in English. It is never allowed to produce the number.

> An LLM that is asked "what is 45000 + 5000 − 2300?" will usually be right.
> "Usually" is not acceptable for someone's salary.

### Rule 2 — The AI only reads, never writes

Every AI database access goes through a read-only query layer scoped to the
logged-in user's role. The AI has no endpoint that can insert, update or delete.
When the AI "approves leave", what actually happens is: the AI summarises the
request, a human clicks Approve, and the ordinary approve endpoint runs.

### Rule 3 — A human decides anything that affects a person

Approvals, salary changes, warnings, terminations, hiring. The AI may recommend
and draft. A human clicks the button. This is the "human-in-the-loop" design and
it is the part of the project that distinguishes it from a CRUD app with a
chatbot bolted on.

## Roles

Three roles. Everything in the system is gated by them.

| Role | Scope | Typical actions |
|---|---|---|
| `EMPLOYEE` | Own records only | Mark attendance, request leave, view own payslip, view own dues, ask AI about self |
| `HR` | All employees | Manage employees, approve leave, run payroll, record dues, send email, ask AI about anyone, view reports |
| `ADMIN` | Everything + system | Everything HR can do, plus create HR accounts, change roles, read audit logs |

`ADMIN` is a superset of `HR`. There is no separate "manager" role — the report
mentions manager dashboards, but a manager in a small organisation *is* HR. If
you later need department-scoped managers, add a `MANAGER` role whose queries
are filtered by `department_id`; nothing else in the design has to change.

## Modules

| Module | Contains |
|---|---|
| Auth | Login, JWT, password hashing, role guards |
| Employees | Profiles, departments, designations, employment status |
| Attendance | Daily records, check-in/out, status, overtime |
| Leave | Leave types, quotas, requests, approvals, balances |
| Payroll | Monthly runs, payslips, salary calculation |
| Dues | Loans, advances, installment recovery from payroll |
| AI | Chat assistant, intent routing, read-only data access |
| Reports | Aggregations, trends, anomaly detection |
| Notifications | In-app notifications and outbound email |
| Recruitment | Job postings, CV intake and matching, interview scheduling |

## Scope note — Recruitment

Recruitment appears in the presentation but **not** in the R&D report's module
list. It is the single largest piece of extra work in the project: reading a
mailbox, parsing CVs, matching against a job description, and scheduling.

It is documented here in full, but it is marked **optional** and is last in the
build order. If time runs short, drop it and say so in your final report. Do not
drop payroll or leave to make room for it.

## Scope note — Attendance input

The report says attendance arrives through "the organisation's selected
attendance method" and lists biometric integration as a *future* enhancement. So
for this project, attendance is entered two ways:

1. The employee presses **Check In / Check Out** in the web app.
2. HR corrects or backfills a record manually.

No biometric device, no hardware. The attendance table is designed so a
biometric importer could write to it later without a schema change.

## What is explicitly out of scope

Listed so that nobody builds them by accident, and so your final report can say
they were deliberate exclusions rather than omissions.

- Mobile application
- Voice interface
- Biometric device integration
- Multi-company / multi-tenant support
- Multi-currency payroll
- Tax computation and statutory filing
- Predictive analytics and forecasting
- Document/policy question answering over uploaded files (RAG)
