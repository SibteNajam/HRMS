# 18 — AI Query Architecture

How the assistant answers **any** question about HR data without a developer
writing a function for each one.

---

## 1. The problem with what exists today

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

- [ ] **Step 1 — Registry scaffold**
  - Define the `EntityDefinition` type.
  - Register three entities first: `attendance`, `leaveRequest`, `employee`.
- [ ] **Step 2 — The translator**
  - Validate an incoming query against the registry.
  - Reject unknown fields, metrics, entities.
  - Apply `scopeBy` from the session.
  - Build and run the Prisma query.
  - Unit tests: scoping applied, denied columns refused, unknown entity rejected.
- [ ] **Step 3 — Expose as one tool**
  - Add `query_hr_data` to the tool list, alongside the existing 21.
  - System prompt: "prefer a specific tool; use `query_hr_data` when none fits."
- [ ] **Step 4 — Fill out the registry**
  - Add `payslip`, `due`, `holiday`, `leaveBalance`.
- [ ] **Step 5 — Prune the curated tools**
  - Delete the ones the registry now covers better.
  - Keep the ones that are genuinely hand-tuned (leave recommendation context, payslip comparison).
- [ ] **Step 6 — Layer 3, if still needed**
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
