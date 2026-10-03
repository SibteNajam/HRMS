# 18 — AI Query Architecture

How the assistant answers **any** question about HR data without a developer
writing a function for each one.

> **Status: built.** Layers 1 and 2 are implemented and tested
> (`backend/src/modules/ai/semantic/`, 140 tests). Layer 3 is not, and the
> reasoning for leaving it is in §9. §10 records where the build differs from
> this plan and why.

---

## 1. The problem this replaced

- The assistant has **21 hand-written tools**. Each is one function, one question shape.
- It answers well when a tool happens to fit:
  - *"Who has never taken leave?"* → works, `get_leave_balances_overview` returned enough.
- It fails outright when none does:
  - *"Which department has the highest overtime?"* → **"I don't have a tool that reports total overtime by department."**
- Every new question needs a developer. Every new feature needs new tools.
- That is hardcoding, and it does not scale.

---

## 2. The target: three layers, not one

| Layer | What it is | Covers | Hardcoding |
|---|---|---|---|
| **1. Curated tools** | The 21 we have | ~80% of real questions | High, but already written |
| **2. Semantic layer** | One generic query tool over a declarative registry | ~19% — anything composable | **One entry per table** |
| **3. Guarded SQL** | Read-only SQL, HR only | The last ~1% | None |

- The model tries them in that order.
- Layer 1 is fastest and cheapest — keep it for the common path.
- **Layer 2 is where the work goes.** It is what removes the hardcoding.
- Layer 3 is the escape hatch, rarely reached.

---

## 3. Layer 2 — the semantic layer

### The idea

- Stop writing a function per question.
- **Describe your data once, declaratively.** Let the model compose queries against that description.
- This is the standard pattern — Cube.js, LookML, dbt metrics all work this way.

### The entity registry

- One declaration per table, roughly 10–15 lines.
- Describes what exists, what can be measured, and how it must be scoped.

```ts
attendance: {
  model: 'attendance',                    // Prisma model
  scopeBy: 'employeeId',                  // how EMPLOYEE role is restricted
  fields:     ['date', 'status', 'checkIn', 'checkOut'],
  dimensions: ['status', 'employee.department.name', 'employee.designation'],
  metrics: {
    count:           { fn: 'count' },
    overtimeMinutes: { fn: 'sum', derived: 'overtimeMinutes' },
    attendanceRate:  { fn: 'custom', handler: 'attendancePercentage' },
  },
  denied: [],                             // columns never exposed
}
```

### The single tool it powers

```
query_hr_data({
  entity:    "attendance",
  filters:   { date: { gte: "2026-09-01", lte: "2026-09-30" } },
  groupBy:   ["employee.department.name"],
  aggregate: ["overtimeMinutes"],
  orderBy:   { overtimeMinutes: "desc" },
  limit:     10
})
```

- *"Which department has the highest overtime?"* becomes **composition**, not a new function.
- So does *"average leave taken per department"*, *"headcount by designation"*, *"who was late most often in Q3"*.

### Why this is not just SQL with extra steps

- The model never writes SQL — it fills a **typed, validated structure**.
- Unknown entity, field or metric → rejected before any query runs.
- `scopeBy` is applied by our code, always, and cannot be expressed away by the model.
- Translation to Prisma is deterministic, so the same request always produces the same query.

---

## 4. How security holds

- **Employee scoping is declarative, not per-function.**
  - `scopeBy: 'employeeId'` means: for an `EMPLOYEE`, inject `WHERE employeeId = <session>`.
  - Injected by our code, from the verified cookie. Not a parameter the model can set.
- **A `denied` list per entity** — `password_hash`, and `baseSalary` for non-HR roles.
- **Entity access is role-gated** — the registry declares which roles may touch each entity.
- **One guard, not 21.** Today the boundary is repeated in every tool; here it is enforced once in the translator.
- Layer 3 (SQL) is **HR/ADMIN only**, on a **read-only MySQL user** — enforced by the database grant, not by our parsing.

---

## 5. The test that matters: adding a feature

Suppose a `training_records` table is added tomorrow.

**Today**
- Write `get_my_trainings` tool. Write `get_training_overview` tool.
- Write executor branches for both. Update the tool list. Update the role filter.
- Still cannot answer *"average training hours by department"* without a third tool.

**After**
- Add ~12 lines to the registry.
- Every question about training works immediately — filter, group, aggregate, join to department.
- No new tool, no executor branch, no role-filter edit.

That is the property you asked for.

---

## 6. Build order

- [x] **Step 1 — Registry scaffold**
  - Define the `EntityDefinition` type.
  - Register three entities first: `attendance`, `leaveRequest`, `employee`.
- [x] **Step 2 — The translator**
  - Validate an incoming query against the registry.
  - Reject unknown fields, metrics, entities.
  - Apply `scopeBy` from the session.
  - Build and run the Prisma query.
  - Unit tests: scoping applied, denied columns refused, unknown entity rejected.
- [x] **Step 3 — Expose as one tool**
  - Add `query_hr_data` to the tool list, alongside the existing 21.
  - System prompt: "prefer a specific tool; use `query_hr_data` when none fits."
- [x] **Step 4 — Fill out the registry**
  - Add `payslip`, `due`, `holiday`, `leaveBalance`.
- [ ] **Step 5 — Prune the curated tools** *(not done — see §10)*
  - Delete the ones the registry now covers better.
  - Keep the ones that are genuinely hand-tuned (leave recommendation context, payslip comparison).
- [ ] **Step 6 — Layer 3** *(not needed — see §9)*
  - Read-only MySQL user, column grants revoked.
  - `run_sql_readonly` tool, HR/ADMIN only.
  - Always return the SQL with the answer so HR can check it.

---

## 7. What this does not fix

- **Hallucinated aggregations.** The model may group by the wrong dimension and
  return a confident wrong answer. Mitigation: return the query structure with
  the result, so HR can see what was asked.
- **Token cost.** The registry summary must go in the prompt — roughly 400–600
  tokens. Meaningful on an 8k/minute free tier.
- **Derived metrics still need code.** `attendancePercentage` cannot be
  expressed as `SUM`/`COUNT`; it stays a named handler. That is correct — those
  are the figures payroll depends on, and they must remain deterministic.
- **It is not a replacement for the rules engine.** Thresholds, payroll maths
  and leave policy stay in tested TypeScript. The registry is for *reading*
  data, never for deciding anything.

---

## 8. Why this is the standard approach

- Curated tools for the common path: fast, cheap, predictable.
- A semantic layer for composition: one declaration per entity, not per question.
- A guarded escape hatch for the long tail, scoped to roles that already have the access.
- The security boundary lives in **one translator**, not scattered across every tool.


---

## 9. Why layer 3 was not built

The read-only SQL escape hatch is the standard answer and it stays on the
plan, but nothing currently reaches for it:

- Ten entities in the registry cover every table that holds answerable data.
- The questions that defeated the curated tools — *"which department has the
  highest overtime"*, *"who was late most often"*, *"average take-home by
  department"* — are all answered by layer 2, verified against the real
  database.
- A read-only grant stops writes, not over-reads. For HR that is fine, since
  they are entitled to every row anyway; so layer 3 would add a second way to
  do what layer 2 already does, with a worse failure mode.

It becomes worth building when someone asks a question the registry genuinely
cannot compose — a window function, a self-join, a correlated subquery. Until
there is such a question, it is an unused code path with database credentials
attached to it.

---

## 10. Where the build differs from this plan

**Fields are a whitelist, not a `denied` list.**
The plan had `denied: ['passwordHash']`. That is a blacklist: a column added
to the schema is exposed until somebody remembers to deny it. Instead each
entity lists the fields that exist, and anything unlisted is invisible. A new
column is private by default. `users` is not in the registry at all, so there
is no route to a password hash by any spelling.

**The catalogue is split in two.**
The plan put the whole registry in the system prompt. Measured, that is about
1,100 tokens on every message, paid whether or not the question needs it — on
an 8k-per-minute tier that is the difference between answering and being
rate-limited. So the prompt carries a one-line index per entity, and
`describe_hr_entity` fetches the fields and metrics for one entity when the
model is actually composing a query. This is the `list_tables` /
`describe_schema` pattern from the standard LangChain SQL-agent write-ups,
and it is the one idea from them worth taking. A spec enforces the budget so
the registry cannot grow past it unnoticed.

**Aggregation happens in TypeScript, not SQL.**
Prisma cannot `groupBy` a relation field, and the useful groupings all cross
one — overtime by *department*, leave by *job title*. Overtime is not a
column either; it is derived from two timestamps by the same function payroll
uses, so the assistant and the payslip cannot disagree. One always-correct
path beats two paths where only one handles the interesting half of the
questions. A query matching more than 5,000 rows is refused with a message
telling the model to narrow it, rather than aggregating a slice and returning
a confident wrong total.

**The curated tools were kept.**
Step 5 proposed deleting the ones the registry covers. They are cheaper — one
round trip instead of describe-then-query — and they return data already
shaped for reading. The registry is the fallback, not the replacement. Worth
revisiting once there is real usage data showing which tools the model stops
choosing.

---

## 11. What the tests hold down

`backend/src/modules/ai/semantic/*.spec.ts` — 140 tests. The ones that matter:

- **Every entity × every role.** For each registered entity, each role either
  is refused outright or comes back with a scope. A restricted role must get
  a `where` naming its own employee id. This sweep covers entities that do
  not exist yet, which is the point.
- **Fail-closed.** An entity declared without `ownedVia` and without
  `shared` is refused for a restricted role rather than shown in full.
  Forgetting a line in the registry closes an entity; it never opens one.
- **A null employee id is refused.** Scoping to `undefined` would produce
  `where: { employeeId: undefined }`, which Prisma drops — and the query
  would quietly return everybody.
- **The scope cannot be displaced.** It is the first clause of an `AND`
  array, so a filter the model writes can only narrow it. A query naming
  another employee returns that employee's rows intersected with your own:
  nothing.
- **A restricted field reads as non-existent.** "You may not see baseSalary"
  confirms both that it exists and that somebody can see it. The message says
  neither.
- **No credential table is reachable.** `users`, `role_assignments` and
  `audit_logs` are not in the registry, and a test fails if they are added.

Verified against the live database as well: an employee grouping payslips by
department gets one row — their own.
