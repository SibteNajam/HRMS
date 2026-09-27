# 05 — Backend Conventions

Rules that apply to every NestJS module. Following them is what makes the
codebase consistent enough that any of the four of you can work in any module.

## The anatomy of a module

Every feature is a folder under `src/modules/` with exactly this shape:

```
modules/leave/
├── leave.module.ts        wiring only
├── leave.controller.ts    HTTP only
├── leave.service.ts       business rules only
├── dto/                   input validation
└── entities/              output shapes
```

### Controllers contain no logic

A controller method should be one line plus decorators. If there is an `if` in
your controller, it belongs in the service.

```ts
@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post('requests')
  @Roles(Role.EMPLOYEE, Role.HR, Role.ADMIN)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.create(user.employeeId, dto);
  }

  @Patch('requests/:id/review')
  @Roles(Role.HR, Role.ADMIN)
  review(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    return this.leaveService.review(user.id, id, dto);
  }
}
```

### Services never read the request

A service takes primitives and DTOs. It does not know what HTTP is. This is what
lets the AI module call `LeaveService.getBalance()` directly without faking a
request object.

```ts
// Good
async getBalance(employeeId: number, year: number) { ... }

// Wrong — now only HTTP can call it
async getBalance(req: Request) { ... }
```

### Services take the scope, never trust the body

The employee ID always comes from the JWT, never from the request body. This one
rule prevents the entire class of "change the ID in the payload and read someone
else's payslip" bugs.

```ts
// Good
create(user.employeeId, dto)

// Wrong
create(dto.employeeId, dto)
```

## DTOs and validation

Enable the global pipe in `main.ts`:

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // strips unknown properties
  forbidNonWhitelisted: true,  // 400 if the client sends extras
  transform: true,             // "5" → 5 for @Type(() => Number)
}));
```

`whitelist` matters more than it looks. Without it, a client can POST
`{ reason: "...", status: "APPROVED" }` and if your service spreads the DTO into
Prisma, the request approves itself.

```ts
export class CreateLeaveRequestDto {
  @IsInt() leaveTypeId: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsString() @Length(10, 500) reason: string;
}
```

Never pass a DTO straight into Prisma. Map the fields explicitly.

## Errors

Throw NestJS HTTP exceptions from services. A global filter turns them into a
consistent response body.

| Situation | Throw |
|---|---|
| Record not found | `NotFoundException` |
| Business rule violated (insufficient leave balance) | `BadRequestException` |
| Role not permitted | `ForbiddenException` |
| Duplicate (attendance already marked today) | `ConflictException` |

```ts
if (balance.remaining < dto.days) {
  throw new BadRequestException(
    `Insufficient balance. Requested ${dto.days} days, ${balance.remaining} remaining.`,
  );
}
```

Write messages a user can act on. "Bad request" tells nobody anything.

Response shape produced by the filter:

```json
{ "statusCode": 400, "message": "Insufficient balance...", "path": "/leave/requests", "timestamp": "..." }
```

## Transactions

Any operation that writes more than one table uses `prisma.$transaction`. There
are three of these in the project and all three are correctness-critical:

| Operation | Tables |
|---|---|
| Approve leave | `leave_requests` + `leave_balances` + `notifications` |
| Finalise payroll | `payroll_runs` + `payslips` + `due_payments` |
| Record a due payment | `due_payments` + `dues` (status) |

```ts
return this.prisma.$transaction(async (tx) => {
  const req = await tx.leaveRequest.update({ ... });
  await tx.leaveBalance.update({ ... });
  await tx.notification.create({ ... });
  return req;
});
```

Approving leave without a transaction means a crash between the two writes
leaves a request approved and the balance untouched. It will happen once, in the
demo, and you will not know why.

## Audit logging

Do not write audit rows by hand. Decorate the route:

```ts
@Patch('requests/:id/review')
@Roles(Role.HR, Role.ADMIN)
@Audit('LEAVE_REVIEWED', 'leave_request')
review(...) { ... }
```

`AuditInterceptor` reads the decorator, waits for the handler to succeed, and
writes `audit_logs` with the actor from the JWT, the entity ID from the route
params, and the response as metadata. If the handler throws, nothing is logged.

Routes that must carry `@Audit`:

- Any employee create/update, especially `base_salary`
- Leave approve and reject
- Payroll finalise
- Dues create and waive
- Role change, user deactivate

## Configuration

Never read `process.env` outside `ConfigService`. Every value from `.env` gets a
typed accessor, validated at boot with a Joi schema.

```ts
// Good
this.config.get<number>('LATE_THRESHOLD_MINUTES')

// Wrong — silently undefined if the key is misspelled
process.env.LATE_THRESHOLD_MINUTES
```

Boot-time validation means a missing `ANTHROPIC_API_KEY` crashes on startup with
a clear message, rather than at 11pm during your demo when someone first opens
the chat panel.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `leave-request.service.ts` |
| Classes | PascalCase | `LeaveRequestService` |
| Methods | camelCase, verb first | `calculateNetSalary` |
| Routes | plural nouns, kebab-case | `/leave/requests`, `/payroll/payslips` |
| Database | snake_case | `leave_requests`, `employee_id` |
| Enums | SCREAMING_SNAKE | `PENDING`, `ON_LEAVE` |
| Booleans | `is` / `has` prefix | `isActive`, `hasApproved` |

Prisma maps `leave_requests` to `leaveRequest` automatically via `@@map`. Write
snake_case in the schema and camelCase in TypeScript; never mix within a layer.

## Testing

Unit tests are required for the deterministic rule functions only. These are the
functions that Rule 1 says the AI must never touch, so they are the functions
that must be provably right.

| File | Must cover |
|---|---|
| `payroll.service.spec.ts` | Net salary with allowances, overtime, unpaid leave, dues, bonus, and zero of each |
| `leave.service.spec.ts` | Working-day count across weekends, balance rejection, overlapping requests |
| `attendance.service.spec.ts` | Late threshold boundary, overtime threshold, attendance percentage |

Controllers, DTOs and the AI module do not need unit tests for this project.
Testing an LLM's prose output is not a good use of your remaining weeks.
