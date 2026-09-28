import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LeaveService } from '../../leave/leave.service.js';
import { AttendanceService } from '../../attendance/attendance.service.js';
import { Role } from '../../../common/enums/role.enum.js';
import type { JwtUser } from '../../../common/types/jwt-user.js';
import { dateOnly } from '../../attendance/attendance-policy.js';
import { HR_TOOL_NAMES, SELF_TOOL_NAMES } from './tool-definitions.js';

/**
 * Runs a tool the model asked for.
 *
 * Two rules hold for every branch below:
 *   1. The employee id comes from the verified session, never from the model.
 *   2. An HR-scoped tool is refused outright for an EMPLOYEE, even though
 *      they were never given it — defence in depth, in case a tool list is
 *      ever assembled wrongly.
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
  ) {}

  async execute(name: string, rawArgs: string, user: JwtUser): Promise<unknown> {
    if (HR_TOOL_NAMES.has(name) && user.role === Role.EMPLOYEE) {
      this.logger.warn(`EMPLOYEE ${user.email} attempted HR tool ${name}`);
      throw new ForbiddenException('Not permitted');
    }
    if (!SELF_TOOL_NAMES.has(name) && !HR_TOOL_NAMES.has(name)) {
      throw new ForbiddenException(`Unknown tool ${name}`);
    }

    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
      // A malformed argument string is the model's fault, not the user's.
      return { error: 'Could not read the tool arguments.' };
    }

    switch (name) {
      // ── Self ────────────────────────────────────────────────────────
      case 'get_my_leave_balance':
        return this.leave.balanceFor(this.selfId(user));

      case 'get_my_leave_requests': {
        const result = await this.leave.mine(user, {
          page: 1, limit: 20,
          status: args.status as never,
          skip: 0,
        } as never);
        return result.data.map((r) => ({
          type: r.leaveType.name,
          from: this.day(r.startDate),
          to: this.day(r.endDate),
          days: Number(r.days),
          status: r.status,
          reason: r.reason,
          reviewNote: r.reviewNote,
        }));
      }

      case 'get_my_attendance': {
        const m = await this.attendance.monthFor(this.selfId(user), {
          year: args.year as number,
          month: args.month as number,
        });
        return {
          month: `${m.year}-${String(m.month).padStart(2, '0')}`,
          totals: m.totals,
          days: m.records.map((r) => ({
            date: this.day(r.date),
            status: r.status,
            checkIn: r.checkIn ? this.time(r.checkIn) : null,
            checkOut: r.checkOut ? this.time(r.checkOut) : null,
            minutesWorked: r.minutesWorked,
            overtimeMinutes: r.overtimeMinutes,
          })),
        };
      }

      case 'get_my_attendance_summary':
        return this.attendance.summaryFor(this.selfId(user));

      case 'get_my_dues':
        return this.duesFor(this.selfId(user));

      case 'get_my_payslips': {
        const limit = Math.min(Number(args.limit ?? 3), 12);
        const slips = await this.prisma.payslip.findMany({
          where: { employeeId: this.selfId(user) },
          include: { payrollRun: { select: { month: true, year: true, status: true } } },
          orderBy: [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }],
          take: limit,
        });
        return slips.map((p) => ({
          period: `${p.payrollRun.year}-${String(p.payrollRun.month).padStart(2, '0')}`,
          baseSalary: Number(p.baseSalary),
          allowances: Number(p.allowances),
          overtime: Number(p.overtimeAmount),
          bonus: Number(p.bonus),
          unpaidLeaveDeduction: Number(p.unpaidLeaveDeduction),
          otherDeductions: Number(p.otherDeductions),
          duesRecovered: Number(p.duesDeduction),
          netSalary: Number(p.netSalary),
        }));
      }

      // ── HR ──────────────────────────────────────────────────────────
      case 'search_employees': {
        const employees = await this.prisma.employee.findMany({
          where: {
            ...(args.search
              ? {
                  OR: [
                    { firstName: { contains: String(args.search) } },
                    { lastName: { contains: String(args.search) } },
                    { employeeCode: { contains: String(args.search) } },
                  ],
                }
              : {}),
            ...(args.department
              ? { department: { name: { contains: String(args.department) } } }
              : {}),
            ...(args.status ? { employmentStatus: args.status as never } : {}),
          },
          // No salary. The model has no reason to hold it, and anything it
          // holds can end up in a sentence.
          select: {
            employeeCode: true, firstName: true, lastName: true,
            designation: true, employmentStatus: true, joiningDate: true,
            department: { select: { name: true } },
          },
          take: 50,
          orderBy: { firstName: 'asc' },
        });
        return employees.map((e) => ({
          code: e.employeeCode,
          name: `${e.firstName} ${e.lastName}`,
          designation: e.designation,
          department: e.department.name,
          status: e.employmentStatus,
          joined: this.day(e.joiningDate),
        }));
      }

      case 'get_attendance_overview': {
        const to = args.to ? dateOnly(String(args.to)) : new Date();
        const from = args.from
          ? dateOnly(String(args.from))
          : new Date(to.getTime() - 29 * 86_400_000);
        const rows = await this.attendance.organisationSummary(from, to);
        return {
          from: this.day(from),
          to: this.day(to),
          employees: rows.map((r) => ({
            name: `${r.employee.firstName} ${r.employee.lastName}`,
            department: r.employee.department.name,
            attendancePercentage: r.totals.attendancePercentage,
            lateCount: r.totals.lateCount,
            absentDays: r.totals.absentDays,
            overtimeMinutes: r.totals.overtimeMinutes,
          })),
        };
      }

      case 'get_daily_register': {
        const reg = await this.attendance.register({
          date: args.date ? String(args.date) : undefined,
          page: 1, limit: 200, skip: 0,
        } as never);
        return {
          date: this.day(reg.date),
          isWeekend: reg.isWeekend,
          holiday: reg.holiday?.name ?? null,
          counts: reg.counts,
          employees: reg.rows.map((r) => ({
            name: `${r.employee.firstName} ${r.employee.lastName}`,
            status: r.status,
            checkIn: r.record?.checkIn ? this.time(r.record.checkIn) : null,
            checkOut: r.record?.checkOut ? this.time(r.record.checkOut) : null,
          })),
        };
      }

      case 'get_pending_leave_requests': {
        const result = await this.leave.pendingFor(user, {
          page: 1, limit: 50, skip: 0,
        } as never);
        return result.data.map((r) => ({
          employee: `${r.employee.firstName} ${r.employee.lastName}`,
          department: r.employee.department.name,
          type: r.leaveType.name,
          from: this.day(r.startDate),
          to: this.day(r.endDate),
          days: Number(r.days),
          reason: r.reason,
          balanceRemaining: r.decision?.balance.remaining,
          balanceAfterApproval: r.decision?.balance.afterApproval,
          attendancePercentage: r.decision?.attendance.percentage,
          flags: r.decision?.flags.map((f) => f.label),
        }));
      }

      case 'get_leave_balances_overview': {
        const rows = await this.leave.allBalances(new Date().getFullYear());
        return rows.map((r) => ({
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          department: r.employee.department.name,
          balances: r.balances.map((b) => ({
            type: b.leaveType.name,
            allocated: b.allocated,
            used: b.used,
            remaining: b.remaining,
          })),
        }));
      }

      case 'get_outstanding_dues': {
        const dues = await this.prisma.due.findMany({
          where: { status: 'ACTIVE' },
          include: {
            employee: { select: { firstName: true, lastName: true } },
            payments: { select: { amount: true } },
          },
        });
        return dues.map((d) => {
          const paid = d.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          return {
            employee: `${d.employee.firstName} ${d.employee.lastName}`,
            type: d.type,
            description: d.description,
            principal: Number(d.principalAmount),
            paid,
            remaining: Number(d.principalAmount) - paid,
            monthlyInstallment: Number(d.monthlyInstallment),
          };
        });
      }

      default:
        throw new ForbiddenException(`Unknown tool ${name}`);
    }
  }

  private async duesFor(employeeId: number) {
    const dues = await this.prisma.due.findMany({
      where: { employeeId },
      include: { payments: { select: { amount: true, paidOn: true } } },
      orderBy: { issuedOn: 'desc' },
    });
    return dues.map((d) => {
      const paid = d.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remaining = Number(d.principalAmount) - paid;
      const installment = Number(d.monthlyInstallment);
      return {
        type: d.type,
        description: d.description,
        status: d.status,
        principal: Number(d.principalAmount),
        paid,
        remaining,
        monthlyInstallment: installment,
        // Computed here, not by the model. The moment it does "easy"
        // arithmetic there is no line to point at for which numbers are
        // guaranteed.
        monthsRemaining: installment > 0 ? Math.ceil(remaining / installment) : null,
      };
    });
  }

  /** The id from the verified session. Never from the model's arguments. */
  private selfId(user: JwtUser): number {
    if (!user.employeeId) {
      throw new ForbiddenException(
        'This account has no employee record, so it has no personal HR data.',
      );
    }
    return user.employeeId;
  }

  private day(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  private time(d: Date) {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }
}
