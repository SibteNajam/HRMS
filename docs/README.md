# HR-AI Manager — Documentation

An AI-assisted Human Resource Management System. Conventional HR modules
(employees, attendance, leave, payroll, dues) with an AI layer that explains,
summarises, detects patterns and drafts communication — while all money and
policy calculations stay in deterministic code.

**Stack:** React + TypeScript · Redux Toolkit / RTK Query · Tailwind · NestJS ·
Prisma · MySQL · Claude API

---

## Engineering

Read in order the first time. After that, use them as reference.

| # | Document | Read when |
|---|---|---|
| 00 | [Project Overview](00-project-overview.md) | First. What we are building and the three rules that govern every decision. |
| 01 | [Tech Stack Decision](01-tech-stack-decision.md) | Before any code. Why NestJS replaces FastAPI. |
| 02 | [System Architecture](02-system-architecture.md) | Before any code. How the layers fit together. |
| 03 | [Database Schema](03-database-schema.md) | Before the first migration. Every table and column. |
| 04 | [Setup Checklist](04-setup-checklist.md) | **Before day one.** The accounts and keys *you* must obtain by hand. |
| 05 | [Backend Conventions](05-backend-conventions.md) | Before the first NestJS module. |
| 06 | [Frontend Architecture](06-frontend-architecture.md) | Before the first React screen. RTK Query, folders, state. |
| 07 | [Theme Implementation](07-theming.md) | Before the first component. How dark/light is wired. |
| 08 | [Realtime & Cache Invalidation](08-realtime-and-cache-invalidation.md) | When building the first approval workflow. |
| 09 | [AI Layer](09-ai-layer.md) | Before any AI feature. |
| 10 | [Security & RBAC](10-security-rbac.md) | Before exposing the first endpoint. |

## Design

The visual contract. Read 11 before writing a single component — everything else
in this section depends on its tokens.

| # | Document | Covers |
|---|---|---|
| 11 | [Design System](11-design-system.md) | **Start here.** Colour, typography, spacing, radius, elevation, motion, focus, Tailwind config |
| 12 | [Iconography](12-iconography.md) | Lucide, stroke weights, sizes, the icon-per-concept map |
| 13 | [Component Library](13-component-library.md) | Every primitive with all its states |
| 14 | [Navigation & Layout](14-navigation-and-layout.md) | App shell, two-level sidebar with sub-modules, responsive rules |
| 15 | [Page Blueprints](15-page-blueprints.md) | What goes on every screen, and why |
| 16 | [Data Visualization](16-data-visualization.md) | Chart forms, validated palettes, marks, interaction |
| 17 | [UI Customization](17-ui-customization.md) | White-labelling, brand-colour generation, i18n readiness |
| 18 | [AI Query Architecture](18-ai-query-architecture.md) | How the assistant answers any question without a function per question — the plan to replace hardcoded tools with a semantic layer |

## Feature specifications

One file per module. Each has the same shape: purpose, roles, data, endpoints,
business rules, AI involvement, frontend, manual setup, done-criteria.

| Order | Feature | Depends on |
|---|---|---|
| 1 | [Authentication & Users](features/01-auth.md) | — |
| 2 | [Employee Management](features/02-employee-management.md) | Auth |
| 3 | [Attendance](features/03-attendance.md) | Employees |
| 4 | [Leave Management](features/04-leave-management.md) | Employees, Attendance |
| 5 | [Payroll](features/05-payroll.md) | Employees, Attendance, Leave, Dues |
| 6 | [Dues Management](features/06-dues.md) | Employees |
| 7 | [AI Chat Assistant](features/07-ai-chat-assistant.md) | All of the above |
| 8 | [Reports & Analytics](features/08-reports-analytics.md) | All of the above |
| 9 | [Notifications & Email](features/09-notifications-email.md) | Auth |
| 10 | [Recruitment](features/10-recruitment.md) | Employees, Email · **optional** |

---

## Build order

### Phase 0 — before writing code

1. Complete every 🔴 item in [Setup Checklist](04-setup-checklist.md):
   MySQL, Anthropic API key, Gmail App Password, `.env`.
2. Read [Project Overview](00-project-overview.md) and
   [Design System](11-design-system.md).

### Phase 1 — foundation

3. Prisma schema + migration + seed, from [Database Schema](03-database-schema.md).
4. Design tokens, Tailwind config, `ThemeProvider` — 11 and 07.
5. The `components/ui` primitives from [Component Library](13-component-library.md).
6. App shell and sidebar from [Navigation & Layout](14-navigation-and-layout.md).

Nothing works yet, and that is correct. Every feature after this is faster
because of it.

### Phase 2 — HR core, no AI

7. Auth → 8. Employees → 9. Attendance → 10. Leave → 11. Dues → 12. Payroll

Build these as an ordinary HR system. **No AI at all.** If the AI is built before
there is data, it has nothing to read and nothing to demo.

### Phase 3 — the AI layer

13. AI module and read-only tools — [AI Layer](09-ai-layer.md)
14. Chat assistant · 15. Reports & anomalies · 16. Email drafting

### Phase 4 — polish

17. Notifications and email delivery
18. Dark mode audit across every screen
19. Recruitment, **only if time allows**
20. Rehearse the demo in [§Testing the flow](08-realtime-and-cache-invalidation.md#testing-the-flow)

---

## The three rules

Everything in these documents follows from these. When a design decision is
ambiguous, resolve it here.

1. **The AI never calculates money or policy.** Salary, leave balance, overtime
   and dues come from tested TypeScript functions. The AI reads the result and
   explains it in English.
2. **The AI only reads, never writes.** There is no insert, update or delete
   tool. No prompt can cause a write, because no write capability exists.
3. **A human decides anything that affects a person.** Approvals, salary
   changes, warnings, hiring. The AI recommends and drafts. A human clicks.

---

## Conventions used in these docs

| Marker | Meaning |
|---|---|
| 🔴 **MANUAL** | You do this by hand — an account, a key, a password. No code can do it |
| 🟢 **CODE** | The repository handles it |
| **Done when** | The acceptance checklist closing every feature doc |
| **Review checklist** | The merge gate closing every design doc |
