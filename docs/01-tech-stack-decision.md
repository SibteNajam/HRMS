# 01 — Tech Stack Decision

## The question

The R&D report specifies **Python + FastAPI** for the backend. This document
records why the project uses **Node.js + NestJS** instead, what FastAPI was
actually doing in the original design, and what we lose by changing.

## What FastAPI was doing in the proposal

Read the report carefully and FastAPI has exactly five jobs. None of them is
about machine learning.

| # | Job | Is it Python-specific? |
|---|---|---|
| 1 | Serve REST endpoints, validate request bodies | No |
| 2 | Run the HR rules engine (salary, leave balance, overtime) | No — this is arithmetic |
| 3 | Read and write MySQL | No |
| 4 | Send HTTP requests to the LLM and return the answer | No |
| 5 | Send email via SMTP / Gmail API | No |

Python was chosen by reflex, because "AI project" is assumed to mean Python. That
assumption holds when you **train** models — you need NumPy, pandas, PyTorch,
scikit-learn, and there is no serious Node equivalent.

This project trains nothing. Its entire AI layer is:

```
POST https://api.anthropic.com/v1/messages
```

An HTTP call to a hosted model. Every language can make an HTTP call. The
Python advantage evaporates.

## What about CV parsing in Recruitment?

This is the one place where Python's ecosystem (`PyPDF2`, `pdfplumber`) looks
genuinely useful — and it is the strongest argument for Python in the whole
project.

It still does not survive scrutiny, for two reasons:

1. Node has equivalent libraries (`pdf-parse`, `pdfjs-dist`).
2. We do not need to parse the PDF at all. The Claude API accepts a PDF
   directly as a base64 `document` content block and reads it natively —
   including layout, tables and columns, which text extraction mangles. We send
   the raw file and get structured JSON back. See
   [Recruitment](features/10-recruitment.md).

Sending the PDF to the model is *better* than extracting text first, so the
Python library advantage becomes a Python library disadvantage.

## Why NestJS specifically

Your requirement was "module based so it is scalable to add more features". That
is precisely what NestJS is built around, and it is not what FastAPI is built
around.

| Requirement | NestJS | FastAPI |
|---|---|---|
| Enforced module boundaries | `@Module()` with explicit `imports`/`exports` — a module cannot use another's service unless it is exported | Convention only; any file may import any file |
| Dependency injection | Built in, constructor-based | Per-route `Depends()`, no container |
| Role guards | `@Roles('HR')` decorator + a global guard | Hand-rolled per route |
| Shared types with React | Same TypeScript interfaces in both, one repo | Pydantic and TypeScript types maintained separately, by hand, forever |
| Testing seams | DI makes mocking a service one line | Requires dependency overrides |

The last row is the practical one. With NestJS you write `Payslip` once and both
the API and the React app use it. With FastAPI you write it in Pydantic, then
write it again in TypeScript, then forget to update one of them.

## Decision

**Node.js + NestJS for the entire backend. No Python service.**

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| State | Redux Toolkit + RTK Query |
| UI | Tailwind CSS v4 (CSS-first tokens) |
| Backend | NestJS 10 + TypeScript |
| ORM | Prisma 7 (driver adapter) |
| Database | MySQL 8 |
| Auth | JWT in an httpOnly cookie (`@nestjs/jwt`) + `bcrypt` |
| AI | `@anthropic-ai/sdk` — Claude API |
| Email | `nodemailer` over Gmail SMTP |
| Validation | `class-validator` (backend), `zod` (AI output schemas) |
| Jobs | `@nestjs/schedule` for cron tasks |

## Why Prisma and not TypeORM

Prisma generates TypeScript types from your schema file. Change a column, run
`prisma generate`, and every query that no longer type-checks lights up red in
your editor before you run anything. TypeORM's decorator-based entities do not
give you this. For a four-person team on a deadline, that feedback loop is worth
more than any other ORM feature.

## What we lose

Be honest about this in your report — it is a stronger submission if you show
you evaluated the tradeoff rather than just preferring what you knew.

- **No pandas.** Attendance and payroll aggregation is written as SQL
  (`GROUP BY`, window functions) instead of dataframe operations. For this data
  volume SQL is faster anyway, but the code is more verbose.
- **No local ML.** If a future version wants a trained anomaly-detection model
  rather than threshold rules, that becomes a separate Python service. Our
  anomaly detection is rule-based plus the LLM, so this does not bite now.
- **Divergence from the submitted proposal.** Tell your supervisor before you
  start. Point at this document.

## How to present the change

> The proposal specified FastAPI on the assumption that an AI-integrated system
> requires Python. On review, the AI layer consists entirely of calls to a hosted
> language model over HTTP, and all HR calculations are deterministic arithmetic
> that is deliberately kept out of the model. Neither benefits from Python's
> scientific stack. We moved to NestJS to gain enforced module boundaries,
> dependency injection, and a single shared type definition across frontend and
> backend — which directly serves the modularity and scalability goals stated in
> the proposal.
