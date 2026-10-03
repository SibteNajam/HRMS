# 11 — Projects & Staffing

Why leave stopped being a question about one person.

---

## The gap this closes

A leave request used to be judged on the individual and their department:
balance, attendance, how much of the department was already off. All of that
can look fine while the request is still the one that stops the work.

> Two backend engineers on a project, in a department of twelve. One is
> already off. The department ratio reads 8% — healthy. The project has
> nobody who can do the work.

Departments are an HR structure. **Projects are what the work depends on**,
and nothing in the system knew about them.

---

## The shape

| Table | What it holds |
|---|---|
| `projects` | Name, code, status |
| `project_teams` | A team on a project, and **`minimum_staff`** |
| `project_team_members` | Who is on it, and `role_on_team` |

### Why the minimum is on the team, not the project

A project has several teams — Tech, Marketing, Finance — and they do not need
the same cover. A marketing team of two and an engineering team of eight are
different problems. HR sets each one separately.

### Why `role_on_team` is separate from `designation`

The same person can be a Backend Engineer on one project and a Tech Lead on
another. Cover has to be judged by what they do on **this** project, so the
membership row carries its own role and falls back to their designation when
it is not set.

---

## The two rules it adds

Both are ordinary entries in `DECISION_RULES`, weighted `concern` — see
[04 — Leave management](04-leave-management.md).

| Rule | Fires when |
|---|---|
| `PROJECT_UNDERSTAFFED` | Approving would leave fewer available than `minimum_staff` |
| `PROJECT_ROLE_UNCOVERED` | Everyone else on the team with this role is already off |

`PROJECT_UNDERSTAFFED` reports the **worst** breach when several teams are
affected — that is the one that decides whether the request can go ahead.

A minimum is the number that must *remain*, not the number you must stay
above: a request that lands exactly on it goes through. The next one does
not.

---

## Automatic approval

With `LEAVE_AUTO_APPROVAL=true`, a request that trips no rule is approved
when it is submitted. No queue, no click.

```
submitted
  ↓
decisionContext()      balance · attendance · history · department · PROJECTS
  ↓
DECISION_RULES         every rule evaluated
  ↓
verdictFloor() === APPROVE ?
  ├── yes → approved, reviewedBy = null, autoApproved = true
  └── no  → PENDING, HR decides
```

### What decides it

**The rules engine, not a model.** Every figure is computed in TypeScript
that is unit-tested and can be explained to the employee afterwards. The
assistant is not called at any point in this path. It writes sentences about
leave; it does not grant it.

### What it will not do

**It never rejects.** A request that fails a rule is *held for review*, not
refused. "Not approved yet" is a queue; "rejected" is a decision about
somebody's time off, and a human makes it.

### Adding a condition

One entry in `DECISION_RULES` with weight `concern` narrows what goes through
automatically, immediately, with no other edit. `autoApprovable()` is
literally `verdictFloor(hits) === 'APPROVE'`, so the auto-approval gate and
the recommendation floor cannot drift apart. A test asserts they agree across
every fixture.

---

## What HR sees

- **Projects & staffing** (`/projects`) — every team, its minimum, who is on
  it, how many are off today, and a stepper to change the minimum. A team at
  or below its limit says so in words.
- **All requests** — automatic approvals show **Automatic** in the reviewer
  column with the note they were decided on, instead of an empty dash.
- **Approvals queue** — a held request shows the staffing flag naming the
  team, the numbers and who is already off.

Raising a minimum above the current headcount is **allowed and warned
about**, not refused. "We need five and have four" is a real situation, and a
system that refuses to record it just gets worked around.

---

## The demo scenario

Created by `20261003123000_seed_project_staffing_scenario`, which is
idempotent and self-contained — it creates the departments and leave types it
needs rather than assuming the seed has run.

```
Apollo Platform · Tech          minimum 4, eight members
  5 Backend Engineers, 3 Frontend Engineers
  Hamza Iqbal  (Backend)   off 19–23 Oct 2026
  Zainab Noor  (Frontend)  off 20–22 Oct 2026
```

| Request across those dates | Available after | Outcome |
|---|---|---|
| 3rd person | 5 | **Auto-approved** |
| 4th person | 4 | **Auto-approved** — exactly on the minimum |
| 5th person | 3 | **Held for HR** |

Sign in as any of them with `Emp@12345`.

Verified end to end: the third and fourth requests came back `APPROVED` with
`autoApproved: true`, and the fifth came back `PENDING` carrying the flag
*"Approving leaves 3 people available of 8, and this team needs 4."*
