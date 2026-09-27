# 10 — Security & RBAC

You asked for security to be handled at the API level, per role. This document
is the specification the guards implement.

## Authentication

**JWT, stateless.** Login returns a token; every subsequent request carries it
as `Authorization: Bearer <token>`.

```ts
// Token payload — nothing sensitive, it is base64, not encrypted
{
  sub: user.id,
  employeeId: user.employeeId,   // null for a system admin
  email: user.email,
  role: user.role,
  name: 'Ali Raza',
}
```

Never put a salary, a password hash, or any personal data in the payload.
Anyone holding the token can read it.

### Passwords

```ts
const hash = await bcrypt.hash(password, 12);
const ok   = await bcrypt.compare(attempt, user.passwordHash);
```

bcrypt with cost 12. Never MD5, never SHA-256, never plaintext. The hash never
leaves the database — it is excluded from every response DTO.

### Token storage in the browser

**The token is never in the browser's reach.** It is issued as an httpOnly
cookie, which JavaScript cannot read, so an XSS bug cannot exfiltrate the
session.

```ts
res.cookie(COOKIE_NAME, token, {
  httpOnly: true,                        // JS cannot read it
  secure: isProd,                        // HTTPS only in production
  sameSite: isProd ? 'strict' : 'lax',   // blocks the cross-site POSTs CSRF needs
  path: '/',
  maxAge: JWT_TTL_SECONDS * 1000,        // same value that signed the token
});
```

The frontend keeps a `SessionUser` object in Redux for rendering — a name, a
role, an id — but **never a credential**. On load it asks `GET /auth/me`; the
server either answers or returns 401, and the base query redirects. That is the
only way a client can know whether it is signed in when it cannot read the
cookie.

Three details that are easy to get wrong:

| Detail | Why |
|---|---|
| `credentials: 'include'` on every request | Without it the browser silently omits the cookie cross-origin and every call 401s |
| `enableCors({ origin: FRONTEND_URL, credentials: true })` | A wildcard origin is rejected by the browser when credentials are on |
| Cookie `maxAge` derived from `JWT_TTL_SECONDS` | One source of truth, so the cookie can never outlive the token or vice versa |

**No refresh token.** A daily sign-in is acceptable for an internal HR tool used
during working hours, and rotation — storage, revocation, reuse detection — is a
meaningful subsystem that buys nothing here. Recorded as a deliberate exclusion;
it belongs in Future Enhancements, not in this build.

**CSRF.** `sameSite` carries the protection. `strict` in production means the
cookie is not sent on any cross-site request, so a form on an attacker's page
cannot act as the user. In development it is `lax` so that ordinary navigation
between `localhost:3001` and `localhost:4000` works. If you ever need
`sameSite: 'none'` — a different domain for the API — you must add a CSRF token;
say so in your report rather than discovering it later.

## How an account gets its role

The question this answers: when someone signs up, how does the system decide
whether they are an EMPLOYEE, HR or ADMIN?

### What we do NOT do: infer the role from the email address

A tempting scheme is to encode the role in the address —
`emp.sibte@…`, `hr.ali@…`, `ad.ghulam@…` — and have the code read the prefix.

**This is a privilege-escalation hole, not an authorization scheme.** The
person signing up types their own email address. If the prefix grants the
role, then the role is granted by a text input:

```
POST /auth/register  { "email": "ad.attacker@cadrehrms.com", ... }
→ ADMIN
```

Every other control — the password, the guards, the signed JWT — is bypassed
by one field. It also breaks in three quieter ways: addresses change when
people marry or the company rebrands, and the role silently changes with them;
promoting someone means changing their login identity and orphaning their
history; and `Hr.Ali@` / `hrr.ali@` typos resolve unpredictably.

**The prefix convention itself is good** — it makes a user list readable at a
glance. Keep it as a naming convention. Just never let code read it.

### What we do: a pre-assignment allowlist

An ADMIN records the email and its role **before** that person registers.
Registration looks the address up and grants exactly what was recorded.

```
role_assignments
  email      hr.ali@cadrehrms.com
  role       HR
  note       HR lead
  claimedAt  null → set when the account is created
  createdBy  the admin who authorised it
```

The authority moves from the person registering to an existing administrator,
which is the property that makes it safe.

### Resolution order at signup

```
1. Is the domain allowed?          SIGNUP_MODE + ALLOWED_EMAIL_DOMAINS
                                   → 403 if not
2. Is the email in role_assignments?
      yes, unclaimed  → grant that role, stamp claimedAt
      yes, claimed    → grant EMPLOYEE, log a warning
      no              → grant EMPLOYEE
                        (or 403 when SIGNUP_MODE=invite_only)
```

**It fails closed.** Every path that is not an explicit, unclaimed assignment
results in the least privileged role. An unknown address can never become HR
or ADMIN by accident.

The `claimedAt` check matters: without it, deleting an account would leave a
live assignment that re-grants ADMIN to whoever registers that address next.

### Signup modes

| `SIGNUP_MODE` | Who may register | Use |
|---|---|---|
| `open` | anyone | Local development |
| `domain` | company addresses only | **Default** |
| `invite_only` | only pre-assigned addresses | Production |

```bash
SIGNUP_MODE=domain
ALLOWED_EMAIL_DOMAINS=cadrehrms.com
```

### Managing assignments

ADMIN only — this is the mechanism that grants privilege, so it is the one
endpoint set HR must never reach.

| Method | Path | Does |
|---|---|---|
| GET | `/admin/role-assignments` | List, claimed and pending |
| POST | `/admin/role-assignments` | Pre-assign a role to an address |
| DELETE | `/admin/role-assignments/:id` | Revoke an unclaimed assignment |
| POST | `/admin/role-assignments/promote` | Change the role of an **existing** account |

Two safeguards in the service: a claimed assignment cannot be deleted (it is
the record of what was granted), and an admin cannot demote themselves —
otherwise one click locks everyone out of user management.

### Why not an invitation email with a token

That is the fuller version of this pattern and the right answer for a
commercial product: the invite carries a signed, expiring token, so the role
cannot be claimed by anyone but the intended recipient. It needs working email
delivery, token storage and an expiry policy. Recorded as a future
enhancement; the allowlist gives the same authorization property without that
machinery.

## Authorisation

Two guards, applied globally, in this order.

```ts
// app.module.ts — order matters: throttle, authenticate, authorise
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

Global means **secure by default**. A new endpoint is protected the moment it is
written. Opening one up is an explicit `@Public()`, which is visible in code
review — the opposite of the usual mistake, where someone forgets to add a
guard and nobody notices.

```ts
@Public()                 // only login and health
@Roles(Role.HR, Role.ADMIN)
```

## Endpoint permission matrix

The complete authorisation specification. `self` means the endpoint exists for
that role but returns only their own records.

### Employees

| Endpoint | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| `GET /employees` | ✗ | ✓ | ✓ |
| `GET /employees/me` | ✓ | ✓ | ✓ |
| `GET /employees/:id` | ✗ | ✓ | ✓ |
| `POST /employees` | ✗ | ✓ | ✓ |
| `PATCH /employees/:id` | ✗ | ✓ | ✓ |
| `PATCH /employees/:id/salary` | ✗ | ✗ | ✓ |
| `DELETE /employees/:id` | ✗ | ✗ | ✓ |

Salary changes are ADMIN-only and always audited.

### Attendance

| Endpoint | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| `POST /attendance/check-in` | ✓ | ✓ | ✓ |
| `POST /attendance/check-out` | ✓ | ✓ | ✓ |
| `GET /attendance/me` | ✓ | ✓ | ✓ |
| `GET /attendance` | ✗ | ✓ | ✓ |
| `PATCH /attendance/:id` | ✗ | ✓ | ✓ |

### Leave

| Endpoint | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| `POST /leave/requests` | ✓ | ✓ | ✓ |
| `GET /leave/requests/me` | ✓ | ✓ | ✓ |
| `GET /leave/requests/pending` | ✗ | ✓ | ✓ |
| `PATCH /leave/requests/:id/review` | ✗ | ✓ | ✓ |
| `PATCH /leave/requests/:id/cancel` | self | ✓ | ✓ |
| `GET /leave/balance/me` | ✓ | ✓ | ✓ |

HR cannot approve their own request — enforced in the service, not the guard.

### Payroll

| Endpoint | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| `GET /payroll/payslips/me` | ✓ | ✓ | ✓ |
| `GET /payroll/runs` | ✗ | ✓ | ✓ |
| `POST /payroll/runs` | ✗ | ✓ | ✓ |
| `POST /payroll/runs/:id/finalise` | ✗ | ✗ | ✓ |

Creating a draft run is HR. **Finalising is ADMIN.** Finalising is the
irreversible step that issues payslips and deducts dues, so it requires a second
pair of eyes.

### Dues

| Endpoint | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| `GET /dues/me` | ✓ | ✓ | ✓ |
| `GET /dues` | ✗ | ✓ | ✓ |
| `POST /dues` | ✗ | ✓ | ✓ |
| `PATCH /dues/:id/waive` | ✗ | ✗ | ✓ |

### AI, Reports, Admin

| Endpoint | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| `POST /ai/chat` | ✓ (self scope) | ✓ (org scope) | ✓ |
| `GET /reports/*` | ✗ | ✓ | ✓ |
| `GET /audit-logs` | ✗ | ✗ | ✓ |
| `POST /users` | ✗ | ✗ | ✓ |
| `PATCH /users/:id/role` | ✗ | ✗ | ✓ |

## Ownership checks

A role guard answers "may this role use this endpoint?". It does not answer "may
this user touch this record?". That second question is the service's job, and
forgetting it is the most common real vulnerability in applications like this.

```ts
async cancel(user: JwtUser, requestId: number) {
  const req = await this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundException('Leave request not found');

  const isOwner = req.employeeId === user.employeeId;
  const isHr = user.role === Role.HR || user.role === Role.ADMIN;
  if (!isOwner && !isHr) throw new ForbiddenException();

  if (req.status !== 'PENDING') {
    throw new BadRequestException('Only pending requests can be cancelled.');
  }
  ...
}
```

Any route with an `:id` that an EMPLOYEE can reach needs this check. Write it
every time; there are only a handful.

## Validation

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

`whitelist: true` is a security control, not a tidiness one. It strips
properties that are not on the DTO. Without it, a client can POST
`{ reason: "...", status: "APPROVED", employeeId: 7 }` and if the service ever
spreads the DTO into a Prisma call, the request approves itself for someone
else.

Never spread a DTO into Prisma. Map fields explicitly.

## Rate limiting

```ts
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
```

| Route | Limit | Why |
|---|---|---|
| `POST /auth/login` | 5 / minute | Brute force |
| `POST /ai/chat` | 20 / minute | Cost |
| Everything else | 100 / minute | General |

## Other headers and settings

```ts
app.use(helmet());
app.enableCors({
  origin: config.get('FRONTEND_URL'),   // exact origin, never '*'
  credentials: true,
});
```

## SQL injection

Prisma parameterises every query, so ordinary code is safe by construction. The
only exposure is `$queryRaw`, which the reports module uses for aggregation.
Always use the tagged template, never string concatenation:

```ts
// Safe — parameterised
await this.prisma.$queryRaw`
  SELECT employee_id, COUNT(*) FROM attendance
  WHERE date BETWEEN ${start} AND ${end} GROUP BY employee_id
`;

// Injectable — never do this
await this.prisma.$queryRawUnsafe(
  `SELECT * FROM attendance WHERE date > '${start}'`,
);
```

`$queryRawUnsafe` should not appear anywhere in the codebase.

## Data exposure

Define an explicit `select` on every Prisma query that returns a user or
employee. Do not return the whole row and trust the frontend not to display it.

```ts
// Wrong — ships password_hash to the browser
return this.prisma.user.findMany();

// Right
return this.prisma.user.findMany({
  select: { id: true, email: true, role: true, isActive: true },
});
```

Fields that must never appear in any response: `password_hash`. Fields that must
only appear for HR and ADMIN: `base_salary`, and every payslip field for another
employee.

## Audit logging

Every action listed here writes an `audit_logs` row via `@Audit()`:

- Employee created, updated, deleted
- Salary changed
- Leave approved or rejected
- Payroll run finalised
- Due created or waived
- User role changed, user deactivated
- Login failure (`actor_user_id = 0` when the email is unknown)

Audit rows are never updated or deleted. Only ADMIN can read them, and only
through `GET /audit-logs`.

## Security checklist before submission

- [ ] `.env` is in `.gitignore` and has never been committed
- [ ] Seeded demo passwords changed
- [ ] `JWT_SECRET` is a random 48-byte value, not `secret`
- [ ] No `console.log` of a token, key or password
- [ ] Session cookie is `httpOnly` — confirm in DevTools › Application › Cookies
- [ ] `password_hash` absent from every response
- [ ] Global guards registered — spot-check by calling an endpoint with no token
- [ ] Ownership checks on every `:id` route an employee can reach
- [ ] `$queryRawUnsafe` appears nowhere
- [ ] CORS is the exact frontend origin, not `*`
- [ ] Rate limit on login verified by trying six bad passwords
- [ ] An EMPLOYEE token cannot reach `GET /employees` (expect 403)
- [ ] An EMPLOYEE cannot read another employee's payslip by changing the id
