# 02 — System Architecture

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  REACT SPA                                               │
│  Sidebar · feature pages · AI chat panel · theme toggle  │
│  Redux Toolkit + RTK Query (all server state)            │
└────────────────────────┬─────────────────────────────────┘
                         │  JSON over HTTPS, Bearer JWT
┌────────────────────────▼─────────────────────────────────┐
│  NESTJS API                                              │
│                                                          │
│  ① Guards      JwtAuthGuard → RolesGuard                 │
│  ② Controller  route, DTO validation                     │
│  ③ Service     business rules (deterministic)            │
│  ④ Repository  Prisma                                    │
│                                                          │
│  Cross-cutting: AuditInterceptor · ExceptionFilter       │
└──────┬──────────────────────────┬────────────────┬───────┘
       │                          │                │
┌──────▼──────┐   ┌───────────────▼─────┐  ┌───────▼───────┐
│  MySQL 8    │   │  AI MODULE          │  │ MAIL MODULE   │
│  Prisma     │   │  Claude API         │  │ nodemailer    │
│             │   │  read-only tools    │  │ Gmail SMTP    │
└─────────────┘   └─────────────────────┘  └───────────────┘
```

## Request path — a normal HR action

Employee opens the payslip screen.

```
GET /payroll/payslips/me
        │
        ▼
JwtAuthGuard        token valid?          → 401 if not
        ▼
RolesGuard          @Roles(EMPLOYEE,HR,ADMIN)   → 403 if not
        ▼
PayrollController   no body to validate
        ▼
PayrollService      scope: req.user.employeeId
        ▼
Prisma              SELECT ... WHERE employee_id = ?
        ▼
Response            Payslip[]
```

The AI is not involved. This is the majority of the application.

## Request path — an AI action

Employee types "why was my salary lower last month?".

```
POST /ai/chat   { message }
        │
        ▼
JwtAuthGuard + RolesGuard
        ▼
AiController
        ▼
AiService
   │
   ├─ builds a tool set scoped to the caller's role
   │  EMPLOYEE → get_my_payslip, get_my_attendance, get_my_leave_balance, get_my_dues
   │  HR       → the above, plus org-wide read tools
   │
   ├─ sends conversation + tools to Claude
   │
   ├─ Claude asks to call get_my_payslip({ month: 8 })
   │
   ├─ AiService executes it through PayrollService
   │     with employeeId forced from the JWT, never from the model
   │
   ├─ returns the rows to Claude
   │
   └─ Claude writes the English explanation
        ▼
Response   { reply, toolsUsed }
```

The model chooses *which* read tool to call. It never chooses *whose* data.
That is taken from the token, server-side, every time.

## Module dependency graph

An arrow means "imports". There are no cycles; if you find yourself needing one,
the shared piece belongs in `common/`.

```
                       ┌──────────┐
                       │   Auth   │
                       └────┬─────┘
                            │
                       ┌────▼─────┐
              ┌────────┤ Employees├────────┐
              │        └────┬─────┘        │
              │             │              │
        ┌─────▼────┐  ┌─────▼────┐   ┌─────▼────┐
        │Attendance│  │   Dues   │   │Recruitment│
        └─────┬────┘  └─────┬────┘   └─────┬────┘
              │             │              │
        ┌─────▼────┐        │              │
        │  Leave   │        │              │
        └─────┬────┘        │              │
              │             │              │
              └──────┬──────┘              │
                     │                     │
               ┌─────▼────┐                │
               │ Payroll  │                │
               └─────┬────┘                │
                     │                     │
        ┌────────────┼─────────────┐       │
        │            │             │       │
  ┌─────▼────┐ ┌─────▼────┐  ┌─────▼───────▼──┐
  │    AI    │ │ Reports  │  │  Notifications │
  └──────────┘ └──────────┘  └────────────────┘
```

`Notifications` is imported by almost everything and imports almost nothing —
that is correct. `AI` imports many modules read-only and is imported by none.

## Backend folder layout

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── common/
    │   ├── decorators/      @Roles, @CurrentUser, @Public
    │   ├── guards/          jwt-auth.guard.ts, roles.guard.ts
    │   ├── interceptors/    audit.interceptor.ts
    │   ├── filters/         http-exception.filter.ts
    │   ├── dto/             pagination.dto.ts
    │   └── enums/           role.enum.ts, ...
    ├── prisma/              prisma.module.ts, prisma.service.ts
    └── modules/
        ├── auth/
        ├── employees/
        ├── attendance/
        ├── leave/
        ├── payroll/
        ├── dues/
        ├── ai/
        ├── reports/
        ├── notifications/
        └── recruitment/
```

Every module folder has the same five things:

```
modules/leave/
├── leave.module.ts
├── leave.controller.ts
├── leave.service.ts
├── dto/
│   ├── create-leave-request.dto.ts
│   └── review-leave-request.dto.ts
└── entities/
    └── leave-request.entity.ts   # response shape returned to the client
```

Adding a module is: create the folder, copy the five files, register it in
`app.module.ts`. Nothing else in the codebase changes. That is the modularity
requirement, satisfied structurally rather than by convention.

## Frontend folder layout

Mirrors the backend module-for-module, so a feature lives in one folder on each
side and you always know where to look.

```
frontend/src/
├── app/
│   ├── store.ts
│   └── api/
│       ├── baseApi.ts        createApi, baseQuery, tagTypes
│       └── endpoints/        one injectEndpoints file per feature
├── components/
│   ├── ui/                   Button, Input, Table, Modal, Badge, Card
│   └── layout/               Sidebar, Topbar, AppShell, ThemeToggle
├── features/
│   ├── auth/
│   ├── employees/
│   ├── attendance/
│   ├── leave/
│   ├── payroll/
│   ├── dues/
│   ├── ai-chat/
│   ├── reports/
│   └── recruitment/
├── hooks/
├── lib/
├── types/                    shared with backend
└── styles/
```

## Deployment shape

Three processes. Nothing exotic — this runs on one machine or one small VPS.

```
   nginx  ──┬──▶  React static build   (port 80/443)
            └──▶  NestJS API           (port 3000)
                        │
                        ▼
                   MySQL 8             (port 3306)
```

Development: Next.js on 3001 calling the NestJS API on 4000 with
`credentials: include`, MySQL in Docker. The API is a separate origin, not a
proxy — CORS is configured for the exact frontend origin and the session cookie
travels on it.
