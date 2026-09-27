# Feature 02 — Employee Management

**Depends on:** Auth.
**Contains AI:** read-only, through the chat assistant.

## Purpose

The employee record is the root of the system. Attendance, leave, payroll and
dues all hang off it. Everything here is CRUD, and it should be finished quickly
so the features that matter can be built on top.

## Roles

| Action | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| View own profile | ✓ | ✓ | ✓ |
| View all employees | ✗ | ✓ | ✓ |
| Create employee | ✗ | ✓ | ✓ |
| Edit employee | ✗ | ✓ | ✓ |
| Change base salary | ✗ | ✗ | ✓ |
| Change employment status | ✗ | ✓ | ✓ |
| Delete employee | ✗ | ✗ | ✓ |

Salary is separated from the general edit endpoint deliberately. It is the most
sensitive field, it is ADMIN-only, and it is always audited.

## Data

`employees`, `departments` — see
[Database Schema](../03-database-schema.md#employees).

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/employees` | HR, ADMIN | Paginated, searchable, filterable |
| GET | `/employees/me` | any | Own profile |
| GET | `/employees/:id` | HR, ADMIN | Full profile |
| POST | `/employees` | HR, ADMIN | Creates employee + user account |
| PATCH | `/employees/:id` | HR, ADMIN | Everything except salary |
| PATCH | `/employees/:id/salary` | ADMIN | Audited |
| PATCH | `/employees/:id/status` | HR, ADMIN | Audited |
| DELETE | `/employees/:id` | ADMIN | Soft delete |
| GET | `/departments` | any | For dropdowns |
| POST | `/departments` | ADMIN | |

### List query

```
GET /employees?page=1&limit=20&search=ali&departmentId=2&status=ACTIVE&sort=joiningDate:desc
```

Search matches `first_name`, `last_name`, `employee_code` and `email`.
Always paginate. Never return every employee.

## Business rules

1. **Employee code is generated**, format `EMP-0001`, sequential, never reused.
2. **Work email is unique** across employees and users.
3. **Creating an employee creates a user account** in the same transaction. If
   the account fails, the employee is not created.
4. **Joining date cannot be in the future.**
5. **Base salary must be greater than zero.**
6. **Delete is soft** — set `employment_status = TERMINATED` and
   `users.is_active = false`. A hard delete would orphan payslips, which are
   financial records and must survive.
7. **Salary change writes an audit row** with the before and after values.
8. **Leave balances are created on hire** — one row per leave type for the
   current year, pro-rated for the remaining months:
   `allocated = round(annual_quota × monthsRemaining / 12)`.

## AI involvement

None in this module. The chat assistant reads employee data through
`search_employees`, an HR-only read tool. No AI endpoint writes an employee
record.

## Frontend

### Screens

| Screen | Route | Role |
|---|---|---|
| Employee list | `/employees` | HR, ADMIN |
| Employee detail | `/employees/:id` | HR, ADMIN |
| Create / edit | `/employees/new`, `/employees/:id/edit` | HR, ADMIN |
| My profile | `/profile` | any |

The detail page is tabbed: Profile · Attendance · Leave · Payroll · Dues. Each
tab fetches its own data with `skip` until the tab is opened, so opening an
employee does not fire five requests.

### RTK Query

```ts
getEmployees:  providesTags: [{ type: 'Employee', id: 'LIST' }]
getEmployee:   providesTags: (r, e, id) => [{ type: 'Employee', id }]
createEmployee:invalidatesTags: [{ type: 'Employee', id: 'LIST' }]
updateEmployee:invalidatesTags: (r, e, { id }) => [
                 { type: 'Employee', id }, { type: 'Employee', id: 'LIST' }]
updateSalary:  invalidatesTags: (r, e, { id }) => [{ type: 'Employee', id }]
```

Debounce the search box by 300 ms before it reaches the query hook.

## Manual setup

None.

## Done when

- [ ] HR can create an employee and a login is created with it
- [ ] The employee can log in with the emailed password
- [ ] Employee codes increment and never collide
- [ ] Duplicate email is rejected with a clear message
- [ ] Search, filter, sort and pagination all work together
- [ ] HR gets 403 on the salary endpoint
- [ ] A salary change appears in `audit_logs` with before and after
- [ ] A soft-deleted employee cannot log in but their payslips remain
- [ ] Leave balances are created on hire, pro-rated correctly
