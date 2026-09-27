# Feature 01 — Authentication & Users

**Depends on:** nothing. Build this first.
**Contains AI:** no.

## Purpose

One login page for everyone. The role on the account decides which sidebar,
which screens and which data the user gets. Every other feature depends on this
being correct, so it is built first and not revisited.

## Roles

| Role | Created by | Has an employee record? |
|---|---|---|
| `ADMIN` | Seed script | Optional |
| `HR` | ADMIN | Yes |
| `EMPLOYEE` | HR, when creating the employee | Yes |

Nobody self-registers. There is no sign-up page. An account exists because HR
created an employee, and that is the only path in.

## Data

`users` — see [Database Schema](../03-database-schema.md#users).

## Endpoints

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/login` | `@Public()` | Email + password → JWT |
| GET | `/auth/me` | any | Current user + employee profile |
| POST | `/auth/change-password` | any | Own password only |
| POST | `/users` | ADMIN | Create an HR or ADMIN account |
| PATCH | `/users/:id/role` | ADMIN | Change a role |
| PATCH | `/users/:id/deactivate` | ADMIN | Disable login, keep history |

## Business rules

1. **Login is by email.** Case-insensitive; store lowercase.
2. **Wrong email and wrong password return the same error** — `Invalid email or
   password`. Distinguishing them tells an attacker which emails exist.
3. **`is_active = false` blocks login** with `Your account has been deactivated`.
4. **Five attempts per minute per IP.** Sixth returns 429.
5. **Token lifetime is 1 day.** No refresh token — for an internal HR tool used
   during working hours, a daily login is acceptable and a refresh-token rotation
   scheme is a meaningful amount of code for no real gain here.
6. **Changing your own password requires the current one.**
7. **An ADMIN cannot deactivate or demote themselves** — otherwise the system can
   be locked out with one click.
8. **Every login failure is audited** with the attempted email and the IP.

## Employee accounts

When HR creates an employee, a `users` row is created in the same transaction:

- Email = the employee's work email
- Role = `EMPLOYEE`
- Password = generated, 12 characters, emailed to them
- `must_change_password` is **not** implemented — out of scope, and noted as a
  future enhancement

## Frontend

### Screens

| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | Only public route. Centred card, theme toggle in the corner |
| Change password | `/settings/password` | |
| User management | `/settings/users` | ADMIN only |

### Route protection

```tsx
// routes/ProtectedRoute.tsx
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { token, user } = useAppSelector((s) => s.auth);
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user!.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
```

Route guarding is a convenience, not a security control. The backend enforces
authorisation on every request regardless of what the frontend renders.

### State

```ts
// features/auth/authSlice.ts
{ token: string | null, user: JwtUser | null }
```

Persisted to `localStorage`. Rehydrated on boot. Cleared by `logout()`, which is
dispatched both by the logout button and automatically by the base query on any
401.

## Manual setup

🔴 Generate `JWT_SECRET`:

```bash
openssl rand -base64 48
```

Paste into `.env`. Never reuse it across projects and never commit it.

## Done when

- [ ] Login with a seeded account returns a token
- [ ] Wrong password returns 401 with the generic message
- [ ] A deactivated account cannot log in
- [ ] Six rapid failures return 429
- [ ] A request with no token returns 401
- [ ] An EMPLOYEE token on `GET /employees` returns 403
- [ ] Token survives a page refresh
- [ ] Logout clears the store and redirects
- [ ] `password_hash` appears in no response
- [ ] ADMIN cannot deactivate themselves
