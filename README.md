# Cadre

AI-assisted human resource management. Attendance, leave, payroll and dues in
one place, with an assistant that explains the numbers rather than producing
them.

> Academic project title: **HR-AI Manager**. *Cadre* is the product name — a
> cadre is the core group of trained people an organisation is built around.
> Both refer to the same system; use the project title on your report cover.

```
semP/
├── docs/        29 documents — architecture, features, design system
├── backend/     NestJS 12 · Prisma 7 · MySQL
└── frontend/    Next.js 16 · React 19 · Tailwind 4 · RTK Query
```

## Running it

You must complete the 🔴 MANUAL steps in
[docs/04-setup-checklist.md](docs/04-setup-checklist.md) first — MySQL, an
Anthropic API key and a Gmail App Password. Nothing else needs an account.

```bash
# 1. Database (Docker)
docker run -d --name cadre-mysql \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=cadre \
  -p 3306:3306 mysql:8

# 2. API — http://localhost:4000/api
cd backend
cp .env.example .env          # then fill in the blanks
npx prisma migrate dev --name init   # creates the tables
npx prisma db seed                   # demo data
npm run start:dev

# 3. Web — http://localhost:3001
cd ../frontend
cp .env.example .env.local
npm run dev
```

### Seeded accounts

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@cadre.local` | `Admin@123` |
| HR | `aisha@cadre.local` | `Hr@12345` |
| EMPLOYEE | `ahmed@cadre.local` | `Emp@12345` |

Change these before any public demo.

## The three rules

Every design decision in this codebase follows from these.

1. **The AI never calculates money or policy.** Salary, leave balance, overtime
   and dues come from tested TypeScript functions. The AI reads the result and
   explains it in English.
2. **The AI only reads, never writes.** There is no insert, update or delete
   tool, so no prompt can cause a write.
3. **A human decides anything that affects a person.** The AI recommends and
   drafts; a human clicks.

## Authentication

JWT in an **httpOnly cookie**. No refresh token — a daily sign-in is acceptable
for an internal tool, and rotation is left for later.

JavaScript cannot read the cookie, so an XSS bug cannot exfiltrate the session.
`sameSite` blocks the cross-site POSTs that CSRF relies on. Guards are
registered globally, so every new endpoint is protected the moment it is
written and opening one up requires an explicit `@Public()`.

## Documentation

Start at [docs/README.md](docs/README.md).

| | |
|---|---|
| **Before writing code** | [Setup Checklist](docs/04-setup-checklist.md) · [Project Overview](docs/00-project-overview.md) · [Design System](docs/11-design-system.md) |
| **Architecture** | [System Architecture](docs/02-system-architecture.md) · [Database Schema](docs/03-database-schema.md) · [Tech Stack Decision](docs/01-tech-stack-decision.md) |
| **Design** | [Design System](docs/11-design-system.md) · [Iconography](docs/12-iconography.md) · [Components](docs/13-component-library.md) · [Navigation](docs/14-navigation-and-layout.md) |
| **Features** | [10 specifications](docs/README.md#feature-specifications), one per module |
