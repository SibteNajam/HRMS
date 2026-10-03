# 04 — Setup Checklist

Everything that must exist before the code can run. Each item is tagged:

- 🔴 **MANUAL** — you do this by hand, in a browser or a terminal. No code can
  do it for you. These are accounts, keys and passwords.
- 🟢 **CODE** — the repository does this. Listed so you know it is covered and
  do not go looking for it.

Do every 🔴 item **first**. They are the only things that can block the whole
team, and two of them involve waiting on an external service.

---

## Summary — the four things only you can do

| # | Task | Where | Time | Cost |
|---|---|---|---|---|
| 1 | Install MySQL 8 and create the database | Your machine | 15 min | Free |
| 2 | Create an Anthropic API key | console.anthropic.com | 10 min | Pay per use, ~$5 credit is plenty |
| 3 | Create a Gmail App Password | myaccount.google.com | 10 min | Free |
| 4 | Write the `.env` file | Your editor | 5 min | Free |

Nothing else in this project requires an external account.

---

## 1. 🔴 MySQL

**Option A — Homebrew (macOS, no Docker needed):**

```bash
brew install mysql
brew services start mysql        # starts now and on every boot

# A fresh Homebrew MySQL has root with NO password. Set one:
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'changeme';"

# Create the database
mysql -u root -pchangeme -e \
  "CREATE DATABASE cadre CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Stop it again with `brew services stop mysql`.

**Option B — Docker:**

```bash
docker run -d --name cadre-mysql \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=cadre \
  -p 3306:3306 \
  mysql:8
```

**Option C — native installer:** MySQL Installer on Windows, choosing
*Server only*.

`utf8mb4` is not optional. The default `latin1` on older installs will corrupt
any non-English name and any emoji in a leave reason.

**Verify before moving on:**

```bash
mysql -u root -pchangeme -e "SHOW DATABASES;" | grep cadre
```

### Then create the tables

Or run the whole thing in one command:

```bash
cd backend && npm run db:setup
```

That script starts MySQL if it is stopped, sets the root password, creates the
database, runs the migration and seeds — and is safe to re-run.

Step by step, if you prefer. The database is empty until you run the migration. Prisma reads
`DATABASE_URL` from `prisma.config.ts`, so `.env` must be filled in first.

```bash
cd backend
npx prisma migrate dev --name init   # creates every table
npx prisma db seed                   # demo data + 60 days of attendance
```

`migrate dev` writes a `prisma/migrations/` folder. If that folder does not
exist, no tables exist, and every API call that touches the database returns
500.

## 2. 🔴 Anthropic API key — the AI

You said you do not have an API key. This is how you get one.

### Which model

The AI layer calls **Claude** through the official Node SDK. Model IDs and
pricing as of this writing:

| Model | Model ID | Input $/1M tokens | Output $/1M tokens |
|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | $2.00 | $10.00 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 |

Use `claude-opus-5`. Put the model ID in `.env` as `AI_MODEL` so you can change
it in one place if you decide you want a cheaper tier for development.

### What it will cost you

A single HR chat question sends roughly 1,500 input tokens (system prompt, tool
definitions, a few database rows) and returns about 300 output tokens. On Opus 5
that is about **$0.015 per question** — one and a half cents.

A full semester of development and a live demo is realistically a few hundred
questions. **Budget $5–10 for the entire project.** Add $5 of credit and you
will almost certainly not touch it again.

### Steps

1. Go to `console.anthropic.com` and sign up.
2. **Billing → add a payment method → purchase $5 of credit.** New accounts get
   a small trial credit, but do not build a semester project on it — it can run
   out mid-demo.
3. **API Keys → Create Key.** Name it `hr-ai-manager-dev`.
4. Copy it immediately. It is shown once and never again.
5. Paste it into `.env` as `ANTHROPIC_API_KEY`.

### Rules

- The key starts with `sk-ant-`. It is a password.
- **Never commit it.** `.env` must be in `.gitignore` before your first commit.
  A key pushed to a public repo is scraped and used within minutes.
- Never send it to the frontend. All AI calls go through your NestJS backend.
  If the key is in React code, it is in the browser, and it is public.
- If you leak it, revoke it in the console immediately and issue a new one.

**Verify before moving on:**

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-5","max_tokens":64,
       "messages":[{"role":"user","content":"Reply with OK"}]}'
```

A JSON response containing `"OK"` means the key works. A `401` means it is
wrong. A `400` about credit means step 2 was skipped.

---

## 3. 🔴 Gmail SMTP — outbound email

Gmail **will not** accept your normal Google password from an application. You
must generate a 16-character App Password, and that requires 2-Step
Verification to be switched on first. This is the step people get stuck on.

### Steps

1. Go to `myaccount.google.com` → **Security**.
2. Turn on **2-Step Verification** if it is not already on.
   *App Passwords will not appear as an option until you do this.*
3. Search that same Security page for **App passwords**.
4. App: *Mail*. Device: *Other* → type `HR-AI Manager`.
5. Google shows a 16-character password like `abcd efgh ijkl mnop`.
6. **Remove the spaces.** Put `abcdefghijklmnop` in `.env` as `SMTP_PASS`.

### Settings

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false          # STARTTLS on 587. Use true only with port 465.
SMTP_USER=your.address@gmail.com
SMTP_PASS=<16 chars, no spaces>
```

### Limits and warnings

- **500 emails per day** on a free Gmail account. Far beyond what this project
  needs, but do not put a send call inside a loop over all employees without a
  delay.
- Use a **throwaway Gmail account**, not your personal one. You will be storing
  its credentials in a file that four people can read.
- In development, set `MAIL_DRY_RUN=true`. The MailService then writes the email
  to `email_log` and logs it to the console **without sending**. Turn this off
  only for the demo. It will save you from mailing forty test messages to a real
  candidate's address.

**Verify before moving on:** run the mail smoke-test script after the backend is
scaffolded (`npm run mail:test`) and check that the message arrives.

---

## 4. 🔴 The `.env` file

Create `backend/.env`. Copy this exactly and fill in the four values you
obtained above.

```bash
# ── Application ────────────────────────────────────────────
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3001

# ── Database ───────────────────────────────────────────────
DATABASE_URL="mysql://root:changeme@localhost:3306/hr_ai_manager"

# ── Auth ───────────────────────────────────────────────────
# Generate with: openssl rand -base64 48
JWT_SECRET=<paste generated secret>
JWT_EXPIRES_IN=1d
BCRYPT_ROUNDS=12

# ── AI ─────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-<your key>
AI_MODEL=claude-opus-5
AI_MAX_TOKENS=2048
AI_MONTHLY_BUDGET_USD=10

# ── Email ──────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your gmail>
SMTP_PASS=<16-char app password>
MAIL_FROM="HR-AI Manager <your.gmail@gmail.com>"
MAIL_DRY_RUN=true

# ── HR policy ──────────────────────────────────────────────
STANDARD_WORK_HOURS=8
LATE_THRESHOLD_MINUTES=15
OVERTIME_RATE_MULTIPLIER=1.5
WEEKEND_DAYS=0,6                 # Sunday=0, Saturday=6
```

Commit a `.env.example` with every key present and every value blank. New team
members copy it. Never commit `.env` itself.

> **Do not invent policy values in the code.** `LATE_THRESHOLD_MINUTES`,
> `OVERTIME_RATE_MULTIPLIER` and `WEEKEND_DAYS` belong here so the organisation
> can change them without a redeploy. If you find a hardcoded `15` in the
> attendance service, that is a bug.

---

## 5. 🟢 CODE — everything else

Nothing below needs an account, a key or a decision from you. It is implemented
in the repository.

| Item | Where |
|---|---|
| Database tables and relations | `prisma/schema.prisma`, applied by `prisma migrate dev` |
| Seed data (departments, leave types, demo users, 60 days of attendance) | `prisma/seed.ts`, run by `npm run seed` |
| Password hashing | `AuthService`, bcrypt at `BCRYPT_ROUNDS` |
| JWT issue and verify | `AuthModule` + `JwtAuthGuard` |
| Role enforcement | `RolesGuard` + `@Roles()` decorator |
| Audit logging | `AuditInterceptor`, automatic on every mutation |
| Email templates | `notifications/templates/` |
| AI prompts and read-only tools | `ai/prompts/`, `ai/tools/` |
| Dark/light theme | CSS variables + `ThemeProvider` |
| API client and caching | RTK Query `baseApi` |

---

## First-run sequence

Once every 🔴 item is done:

```bash
# Backend
cd backend
npm install
npx prisma migrate dev --name init     # creates all tables
npm run seed                           # demo data
npm run start:dev                      # http://localhost:4000/api

# Frontend, second terminal
cd frontend
npm install
npm run dev                            # http://localhost:3001
```

Seeded logins:

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@hrai.local` | `Admin@123` |
| HR | `hr@hrai.local` | `Hr@12345` |
| EMPLOYEE | `ali@hrai.local` | `Emp@12345` |

Change these before any public demo.

---

## Working with someone else on this

### After every `git pull`

```bash
cd backend && npm install && npm run db:sync
cd ../frontend && npm install
```

`db:sync` is the one to remember. It does two things:

1. **`prisma migrate deploy`** — runs any migration files that are in the
   repo but not yet in your database, in order. Already applied ones are
   skipped, so running it when there is nothing new is safe and does
   nothing.
2. **`prisma generate`** — rewrites the TypeScript client from the schema,
   so new tables and columns appear in autocomplete and typecheck.

Skipping it is the usual cause of *"Property 'leaveRecommendation' does not
exist"* or a `P2021: table does not exist` at runtime: the code was pulled,
the database was not.

### Which command, when

| You want to | Command | What it does |
|---|---|---|
| Catch up after pulling | `npm run db:sync` | Applies new migrations. **Never deletes data.** |
| Change the schema yourself | `npm run db:migrate` | Writes a new migration file from your `schema.prisma` edits, then applies it |
| Start completely fresh | `npm run db:reset` | **Drops everything**, re-runs all migrations, re-seeds |
| Look at the data | `npm run db:studio` | Opens a browser table editor |

Only the person *making* a schema change runs `db:migrate`. It creates a file
under `backend/prisma/migrations/`, which is committed like any other code.
Everyone else just runs `db:sync` after pulling — they never write migrations
by hand and never edit the SQL.

### Your own `.env` is never shared

`.env` is gitignored on purpose: it holds the database password, the JWT
secret and the API keys. A new person copies `.env.example`, fills in their
own MySQL password and their own API key, and works from that. Nothing in it
comes from the repo.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `P1001: Can't reach database server` | MySQL not running | `docker start hr-mysql` |
| `Access denied for user 'root'` | Password mismatch in `DATABASE_URL` | Match it to the value you set |
| `401` from Anthropic | Bad or revoked key | Re-copy from the console |
| `400 credit balance is too low` | No credit purchased | Billing → add credit |
| `535 Username and Password not accepted` | Using your Google password, not an App Password | Redo step 3 |
| App Passwords option missing in Google | 2-Step Verification is off | Turn it on, then retry |
| Emails never arrive | `MAIL_DRY_RUN=true` | Expected. Set `false` to actually send |
| CORS error in browser | `FRONTEND_URL` mismatch | Must equal the Next.js origin exactly (`http://localhost:3001`) |
| `P2021: table does not exist` | Pulled code without applying migrations | `npm run db:sync` |
| `Property '…' does not exist` on `prisma.` | Client not regenerated after a schema change | `npm run db:sync` |
| `P3009: migrate found failed migrations` | A migration half-applied | `npm run db:reset` on a local database — it drops everything |
