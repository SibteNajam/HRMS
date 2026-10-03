import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import { paginated } from '../../common/dto/pagination.dto.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  canReview,
  countWorkingDays,
  parseDateOnly,
  reviewableRoles,
  workingDatesIn,
} from './leave-policy.js';
import type { CreateLeaveRequestDto } from './dto/create-leave-request.dto.js';
import type { ReviewLeaveRequestDto } from './dto/review-leave-request.dto.js';
import type { ListLeaveDto } from './dto/list-leave.dto.js';
import {
  buildFlags, THRESHOLDS,
  type DecisionContext,
} from './leave-decision-context.js';

const REQUEST_INCLUDE = {
  leaveType: { select: { id: true, name: true, annualQuota: true, isPaid: true } },
  employee: {
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true,
      designation: true,
      department: { select: { id: true, name: true } },
      user: { select: { role: true } },
    },
  },
  reviewer: {
    select: { id: true, email: true, role: true,
      employee: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.LeaveRequestInclude;

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get weekendDays() {
    return this.config.getOrThrow<number[]>('WEEKEND_DAYS');
  }

  // ── Reference data ──────────────────────────────────────────────────

  leaveTypes() {
    return this.prisma.leaveType.findMany({ orderBy: { id: 'asc' } });
  }

  /** Balance for the current year, with remaining derived — never stored. */
  async balanceFor(employeeId: number, year = new Date().getFullYear()) {
    const rows = await this.prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
      orderBy: { leaveTypeId: 'asc' },
    });

    return rows.map((b) => ({
      id: b.id,
      year: b.year,
      leaveType: b.leaveType,
      allocated: Number(b.allocated),
      used: Number(b.used),
      remaining: Number(b.allocated) - Number(b.used),
    }));
  }

  async createLeaveType(dto: { name: string; annualQuota: number; isPaid?: boolean }) {
    const clash = await this.prisma.leaveType.findUnique({ where: { name: dto.name } });
    if (clash) throw new BadRequestException('A leave type with that name already exists');

    const type = await this.prisma.leaveType.create({
      data: { name: dto.name, annualQuota: dto.annualQuota, isPaid: dto.isPaid ?? true },
    });

    // Allocate to everyone for the current year, pro-rated for the months
    // remaining — otherwise the type exists but nobody can request it.
    const year = new Date().getFullYear();
    const monthsLeft = 12 - new Date().getMonth();
    const employees = await this.prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' }, select: { id: true },
    });
    if (employees.length && dto.annualQuota > 0) {
      await this.prisma.leaveBalance.createMany({
        data: employees.map((e) => ({
          employeeId: e.id,
          leaveTypeId: type.id,
          year,
          allocated: Math.round((dto.annualQuota * monthsLeft) / 12),
          used: 0,
        })),
        skipDuplicates: true,
      });
    }
    return type;
  }

  /**
   * Changing the quota updates THIS year's allocation for anyone who has not
   * already used more than the new figure — reducing someone below what they
   * have taken would make their balance negative.
   */
  async updateLeaveType(
    id: number,
    dto: { name: string; annualQuota: number; isPaid?: boolean },
  ) {
    const existing = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Leave type not found');

    return this.prisma.$transaction(async (tx) => {
      const type = await tx.leaveType.update({
        where: { id },
        data: { name: dto.name, annualQuota: dto.annualQuota, isPaid: dto.isPaid ?? existing.isPaid },
      });

      if (dto.annualQuota !== existing.annualQuota) {
        await tx.leaveBalance.updateMany({
          where: {
            leaveTypeId: id,
            year: new Date().getFullYear(),
            used: { lte: dto.annualQuota },
          },
          data: { allocated: dto.annualQuota },
        });
      }
      return type;
    });
  }

  // ── Submitting ──────────────────────────────────────────────────────

  async create(user: JwtUser, dto: CreateLeaveRequestDto) {
    const employeeId = this.requireEmployee(user);

    // UTC-anchored: a local-midnight Date in a positive-offset zone stores
    // the previous calendar day in a MySQL DATE column.
    const start = parseDateOnly(dto.startDate);
    const end = parseDateOnly(dto.endDate);

    if (end < start) {
      throw new BadRequestException('The end date cannot be before the start date');
    }

    const thirtyDaysAgo = parseDateOnly(new Date());
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    if (start < thirtyDaysAgo) {
      throw new BadRequestException(
        'Leave cannot be requested more than 30 days in the past',
      );
    }

    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id: dto.leaveTypeId },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    const days = countWorkingDays(start, end, this.weekendDays);
    if (days === 0) {
      throw new BadRequestException(
        'That range contains no working days — it falls entirely on a weekend',
      );
    }

    await this.assertNoOverlap(employeeId, start, end);

    // Unpaid leave has no quota, so no balance check — it produces a payroll
    // deduction instead.
    if (leaveType.annualQuota > 0) {
      const balance = await this.balanceFor(employeeId);
      const line = balance.find((b) => b.leaveType.id === leaveType.id);
      if (!line) {
        throw new BadRequestException('No balance allocated for this leave type');
      }
      if (line.remaining < days) {
        throw new BadRequestException(
          `Not enough ${leaveType.name} leave. You asked for ${days} ` +
            `day${days === 1 ? '' : 's'} and have ${line.remaining} remaining.`,
        );
      }
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: leaveType.id,
        startDate: start,
        endDate: end,
        days,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: REQUEST_INCLUDE,
    });

    await this.notifyApprovers(request.id, user, days, leaveType.name);
    return request;
  }

  // ── Reading ─────────────────────────────────────────────────────────

  async mine(user: JwtUser, dto: ListLeaveDto) {
    const employeeId = this.requireEmployee(user);
    const where: Prisma.LeaveRequestWhereInput = {
      employeeId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.leaveTypeId ? { leaveTypeId: dto.leaveTypeId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, include: REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return paginated(rows, total, { page: dto.page, limit: dto.limit });
  }

  /**
   * The approval queue, scoped to what this reviewer is allowed to act on.
   *
   * HR sees employee requests. ADMIN sees HR and admin requests as well.
   * A reviewer never sees their own request here — they could not action it
   * anyway, and showing it implies otherwise.
   */
  async pendingFor(user: JwtUser, dto: ListLeaveDto) {
    const roles = reviewableRoles(user.role);

    const where: Prisma.LeaveRequestWhereInput = {
      status: 'PENDING',
      employee: {
        user: { role: { in: roles } },
        ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
        ...(user.employeeId ? { id: { not: user.employeeId } } : {}),
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, include: REQUEST_INCLUDE,
        orderBy: { createdAt: 'asc' }, // oldest first — longest waiting
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    // Everything needed to decide, on the card. Without this HR opens another
    // tab to check attendance, and the conflict with a colleague's leave is
    // the thing a human scanning a list reliably misses.
    const withContext = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        decision: await this.decisionContext(r.id),
      })),
    );

    return paginated(withContext, total, { page: dto.page, limit: dto.limit });
  }

  async all(dto: ListLeaveDto) {
    const where: Prisma.LeaveRequestWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.leaveTypeId ? { leaveTypeId: dto.leaveTypeId } : {}),
      ...(dto.departmentId ? { employee: { departmentId: dto.departmentId } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, include: REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return paginated(rows, total, { page: dto.page, limit: dto.limit });
  }

  async pendingCount(user: JwtUser) {
    const roles = reviewableRoles(user.role);
    const count = await this.prisma.leaveRequest.count({
      where: {
        status: 'PENDING',
        employee: {
          user: { role: { in: roles } },
          ...(user.employeeId ? { id: { not: user.employeeId } } : {}),
        },
      },
    });
    return { count };
  }

  async findOne(user: JwtUser, id: number) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id }, include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Leave request not found');

    const isOwner = request.employeeId === user.employeeId;
    const mayReview = canReview(user.role, request.employee.user?.role as Role);
    if (!isOwner && !mayReview) throw new ForbiddenException();

    return request;
  }

  // ── Deciding ────────────────────────────────────────────────────────

  async review(user: JwtUser, id: number, dto: ReviewLeaveRequestDto) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true,
          user: { select: { id: true, role: true } } } },
        leaveType: true,
      },
    });
    if (!request) throw new NotFoundException('Leave request not found');

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `This request was already ${request.status.toLowerCase()}`,
      );
    }

    // Nobody approves their own leave — including an ADMIN, who would
    // otherwise pass the role check below against themselves.
    if (request.employeeId === user.employeeId) {
      throw new ForbiddenException('You cannot review your own leave request');
    }

    const requesterRole = (request.employee.user?.role as Role) ?? Role.EMPLOYEE;
    if (!canReview(user.role, requesterRole)) {
      throw new ForbiddenException(
        requesterRole === Role.HR || requesterRole === Role.ADMIN
          ? 'Leave for HR and administrators must be approved by an administrator'
          : 'You do not have permission to review this request',
      );
    }

    // Did the human follow the advice? Recorded before the decision runs, so
    // it is captured whether the write succeeds or not.
    if (dto.aiVerdict) {
      const followed =
        (dto.aiVerdict === 'APPROVE' && dto.decision === 'APPROVED') ||
        (dto.aiVerdict === 'REJECT' && dto.decision === 'REJECTED');
      await this.prisma.auditLog.create({
        data: {
          actorUserId: user.sub,
          action: followed ? 'LEAVE_AI_FOLLOWED' : 'LEAVE_AI_OVERRIDDEN',
          entity: 'leave_request',
          entityId: request.id,
          metadata: { aiVerdict: dto.aiVerdict, humanDecision: dto.decision },
        },
      }).catch(() => undefined);
    }

    if (dto.decision === 'REJECTED') {
      return this.reject(user, request.id, request.employee.user!.id, dto.note!);
    }
    return this.approve(user, request, requesterRole);
  }

  private async approve(
    user: JwtUser,
    request: { id: number; employeeId: number; leaveTypeId: number; days: Prisma.Decimal;
      startDate: Date; endDate: Date;
      employee: { firstName: string; lastName: string; user: { id: number } | null };
      leaveType: { name: string; annualQuota: number } },
    requesterRole: Role,
  ) {
    const days = Number(request.days);
    const year = request.startDate.getUTCFullYear();

    // Re-check the balance. Several pending requests can each fit
    // individually while exceeding the balance together.
    if (request.leaveType.annualQuota > 0) {
      const balance = await this.prisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
      });
      const remaining = balance
        ? Number(balance.allocated) - Number(balance.used)
        : 0;
      if (remaining < days) {
        throw new BadRequestException(
          `Balance has changed since this was submitted — ${remaining} ` +
            `day${remaining === 1 ? '' : 's'} remaining, ${days} requested.`,
        );
      }
    }

    const dates = workingDatesIn(request.startDate, request.endDate, this.weekendDays);

    // All four writes, or none. A crash between them would leave a request
    // approved with the balance untouched.
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          reviewedBy: user.sub,
          reviewedAt: new Date(),
        },
        include: REQUEST_INCLUDE,
      });

      if (request.leaveType.annualQuota > 0) {
        await tx.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
            },
          },
          data: { used: { increment: days } },
        });
      }

      // ON_LEAVE attendance so the day is excluded from the attendance
      // percentage denominator rather than counting as absence.
      for (const date of dates) {
        await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: request.employeeId, date } },
          create: { employeeId: request.employeeId, date, status: 'ON_LEAVE' },
          update: { status: 'ON_LEAVE' },
        });
      }

      if (request.employee.user) {
        await tx.notification.create({
          data: {
            userId: request.employee.user.id,
            type: 'LEAVE',
            title: 'Leave approved',
            body: `Your ${request.leaveType.name} leave for ${days} day${days === 1 ? '' : 's'} was approved.`,
            link: `/leave`,
          },
        });
      }

      return result;
    });

    this.logger.log(
      `Leave ${request.id} approved by ${user.email} (${user.role}) ` +
        `for ${request.employee.firstName} (${requesterRole})`,
    );
    return updated;
  }

  private async reject(user: JwtUser, id: number, requesterUserId: number, note: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedBy: user.sub,
          reviewedAt: new Date(),
          reviewNote: note,
        },
        include: REQUEST_INCLUDE,
      });

      await tx.notification.create({
        data: {
          userId: requesterUserId,
          type: 'LEAVE',
          title: 'Leave rejected',
          body: note,
          link: `/leave`,
        },
      });
      return result;
    });
  }

  async cancel(user: JwtUser, id: number) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Leave request not found');

    if (request.employeeId !== user.employeeId) {
      throw new ForbiddenException('You can only cancel your own requests');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only a pending request can be cancelled');
    }

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: REQUEST_INCLUDE,
    });
  }

  // ── Organisation-wide views ─────────────────────────────────────────

  /** Every active employee's balance for a year — the HR balances screen. */
  async allBalances(year: number, departmentId?: number, search?: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        ...(departmentId ? { departmentId } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { employeeCode: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        designation: true,
        department: { select: { id: true, name: true } },
        user: { select: { role: true } },
        leaveBalances: {
          where: { year },
          include: { leaveType: true },
          orderBy: { leaveTypeId: 'asc' },
        },
      },
      orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
    });

    return employees.map((e) => ({
      employee: {
        id: e.id, employeeCode: e.employeeCode,
        firstName: e.firstName, lastName: e.lastName,
        designation: e.designation, department: e.department,
        role: e.user?.role ?? 'EMPLOYEE',
      },
      balances: e.leaveBalances.map((b) => ({
        id: b.id,
        leaveType: b.leaveType,
        allocated: Number(b.allocated),
        used: Number(b.used),
        remaining: Number(b.allocated) - Number(b.used),
      })),
    }));
  }

  /**
   * Approved leave overlapping a month, one row per employee.
   *
   * Everyone can see this — knowing who is off is what the calendar is for,
   * and it carries no salary or personal detail. Reasons are omitted.
   */
  async calendar(year: number, month: number, departmentId?: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: to },
        endDate: { gte: from },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      select: {
        id: true, startDate: true, endDate: true, days: true,
        leaveType: { select: { id: true, name: true } },
        employee: {
          select: {
            id: true, firstName: true, lastName: true, employeeCode: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const byEmployee = new Map<number, {
      employee: (typeof requests)[number]['employee'];
      spans: { id: number; startDate: Date; endDate: Date; days: number;
               leaveType: { id: number; name: string } }[];
    }>();

    for (const r of requests) {
      const entry = byEmployee.get(r.employee.id) ?? {
        employee: r.employee,
        spans: [],
      };
      entry.spans.push({
        id: r.id,
        startDate: r.startDate,
        endDate: r.endDate,
        days: Number(r.days),
        leaveType: r.leaveType,
      });
      byEmployee.set(r.employee.id, entry);
    }

    // Which nearby months DO have leave. An empty current month with no
    // hint that October is full is indistinguishable from a broken screen.
    const windowFrom = new Date(Date.UTC(year, month - 7, 1));
    const windowTo = new Date(Date.UTC(year, month + 5, 0));
    const nearby = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: windowTo },
        endDate: { gte: windowFrom },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      select: { startDate: true, endDate: true },
    });

    const months = new Map<string, number>();
    for (const r of nearby) {
      const cursor = new Date(Date.UTC(
        r.startDate.getUTCFullYear(), r.startDate.getUTCMonth(), 1,
      ));
      const last = new Date(Date.UTC(
        r.endDate.getUTCFullYear(), r.endDate.getUTCMonth(), 1,
      ));
      while (cursor <= last) {
        const key = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`;
        months.set(key, (months.get(key) ?? 0) + 1);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    return {
      year,
      month,
      daysInMonth: to.getUTCDate(),
      rows: [...byEmployee.values()],
      monthsWithLeave: [...months.entries()]
        .map(([key, count]) => {
          const [y, m] = key.split('-').map(Number);
          return { year: y, month: m, count };
        })
        .filter((x) => !(x.year === year && x.month === month))
        .sort((a, b) => a.year - b.year || a.month - b.month),
    };
  }

  // ── Decision support ────────────────────────────────────────────────

  /**
   * The facts behind a leave decision, computed by rules only.
   *
   * Covers exactly what the source documents call for: leave balance and
   * policy, repeated lateness, a significant decline in attendance, the 80%
   * attendance standard, and whether the request needs clarification.
   */
  async decisionContext(requestId: number): Promise<DecisionContext> {
    const request = await this.prisma.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        employee: { select: { id: true, departmentId: true, joiningDate: true } },
        leaveType: { select: { id: true } },
      },
    });

    const employeeId = request.employee.id;
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - THRESHOLDS.WINDOW_DAYS);
    const priorStart = new Date(windowStart);
    priorStart.setDate(priorStart.getDate() - THRESHOLDS.WINDOW_DAYS);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [current, prior, balanceRows, history, rejected, department, othersOff] =
      await Promise.all([
        this.prisma.attendance.groupBy({
          by: ['status'],
          where: { employeeId, date: { gte: windowStart, lte: now } },
          _count: true,
        }),
        this.prisma.attendance.groupBy({
          by: ['status'],
          where: { employeeId, date: { gte: priorStart, lt: windowStart } },
          _count: true,
        }),
        this.balanceFor(employeeId),
        this.prisma.leaveRequest.findMany({
          where: { employeeId, status: 'APPROVED', startDate: { gte: yearStart } },
          select: { days: true },
        }),
        this.prisma.leaveRequest.count({
          where: { employeeId, status: 'REJECTED', createdAt: { gte: yearStart } },
        }),
        this.prisma.employee.count({
          where: {
            departmentId: request.employee.departmentId,
            employmentStatus: 'ACTIVE',
          },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            status: 'APPROVED',
            employeeId: { not: employeeId },
            employee: { departmentId: request.employee.departmentId },
            startDate: { lte: request.endDate },
            endDate: { gte: request.startDate },
          },
          select: { employee: { select: { firstName: true, lastName: true } } },
          take: 5,
        }),
      ]);

    const pct = (rows: { status: string; _count: number }[]) => {
      const by = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
      const present = by('PRESENT');
      const late = by('LATE');
      const half = by('HALF_DAY');
      const absent = by('ABSENT');
      const onLeave = by('ON_LEAVE');
      // Approved leave is an entitlement, not absence — it leaves the
      // denominator so an employee is not penalised for using it.
      const workingDays = present + late + half + absent;
      const attended = present + late + half * 0.5;
      return {
        percentage: workingDays ? (attended / workingDays) * 100 : null,
        presentDays: present,
        lateCount: late,
        absentDays: absent,
        onLeaveDays: onLeave,
        workingDays,
      };
    };

    const cur = pct(current as never);
    const prev = pct(prior as never);

    const line = balanceRows.find((b) => b.leaveType.id === request.leaveType.id);
    const remaining = line?.remaining ?? 0;

    const tenureMonths = Math.max(
      0,
      Math.floor(
        (now.getTime() - request.employee.joiningDate.getTime()) /
          (1000 * 60 * 60 * 24 * 30.44),
      ),
    );

    const partial = {
      attendance: {
        windowDays: THRESHOLDS.WINDOW_DAYS,
        percentage: cur.percentage === null ? null : Number(cur.percentage.toFixed(1)),
        previousPercentage:
          prev.percentage === null ? null : Number(prev.percentage.toFixed(1)),
        presentDays: cur.presentDays,
        lateCount: cur.lateCount,
        absentDays: cur.absentDays,
        onLeaveDays: cur.onLeaveDays,
        workingDays: cur.workingDays,
      },
      balance: {
        allocated: line?.allocated ?? 0,
        used: line?.used ?? 0,
        remaining,
        afterApproval: remaining - Number(request.days),
      },
      history: {
        daysTakenThisYear: history.reduce((sum, h) => sum + Number(h.days), 0),
        requestsThisYear: history.length,
        rejectedThisYear: rejected,
        tenureMonths,
      },
      coverage: {
        departmentSize: department,
        othersOffInRange: othersOff.length,
        othersOffNames: othersOff.map(
          (o) => `${o.employee.firstName} ${o.employee.lastName}`,
        ),
      },
    };

    return { ...partial, flags: buildFlags(partial, request.reason) };
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private requireEmployee(user: JwtUser): number {
    if (!user.employeeId) {
      throw new BadRequestException(
        'This account has no employee record, so it cannot request leave',
      );
    }
    return user.employeeId;
  }

  private async assertNoOverlap(employeeId: number, start: Date, end: Date) {
    const clash = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { leaveType: { select: { name: true } } },
    });
    if (clash) {
      throw new BadRequestException(
        `This overlaps an existing ${clash.status.toLowerCase()} ` +
          `${clash.leaveType.name} request`,
      );
    }
  }

  /** Notify whoever is allowed to approve this request. */
  private async notifyApprovers(
    requestId: number, requester: JwtUser, days: number, typeName: string,
  ) {
    const roles =
      requester.role === Role.EMPLOYEE ? [Role.HR, Role.ADMIN] : [Role.ADMIN];

    const approvers = await this.prisma.user.findMany({
      where: { role: { in: roles }, isActive: true, id: { not: requester.sub } },
      select: { id: true },
    });

    if (approvers.length === 0) {
      this.logger.warn(`Leave ${requestId} has no eligible approver`);
      return;
    }

    await this.prisma.notification.createMany({
      data: approvers.map((a) => ({
        userId: a.id,
        type: 'LEAVE' as const,
        title: 'Leave request awaiting approval',
        body: `${requester.name} requested ${days} day${days === 1 ? '' : 's'} of ${typeName} leave.`,
        link: '/leave/approvals',
      })),
    });
  }
}
