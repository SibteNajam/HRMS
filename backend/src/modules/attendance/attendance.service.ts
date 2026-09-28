import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { paginated } from '../../common/dto/pagination.dto.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  dateOnly, isWeekend, minutesWorked, overtimeMinutes,
  statusAtCheckIn, statusAtCheckOut, totalsFrom, workingDatesIn,
  type AttendancePolicy,
} from './attendance-policy.js';
import type {
  CorrectAttendanceDto, CreateHolidayDto, ListAttendanceDto,
  MonthQueryDto, UpsertAttendanceDto,
} from './dto/attendance.dto.js';

const EMPLOYEE_SELECT = {
  id: true, employeeCode: true, firstName: true, lastName: true,
  designation: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Policy lives in .env — "late" is an organisational rule, not a constant. */
  get policy(): AttendancePolicy {
    return {
      standardWorkHours: this.config.getOrThrow<number>('STANDARD_WORK_HOURS'),
      workDayStart: this.config.getOrThrow<string>('WORK_DAY_START'),
      lateThresholdMinutes: this.config.getOrThrow<number>('LATE_THRESHOLD_MINUTES'),
      overtimeRateMultiplier: this.config.getOrThrow<number>('OVERTIME_RATE_MULTIPLIER'),
      weekendDays: this.config.getOrThrow<number[]>('WEEKEND_DAYS'),
    };
  }

  // ── Check in / out ──────────────────────────────────────────────────

  async checkIn(user: JwtUser) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());
    const now = new Date();

    if (isWeekend(today, this.policy.weekendDays)) {
      throw new BadRequestException('Today is not a working day');
    }
    const holiday = await this.prisma.holiday.findUnique({ where: { date: today } });
    if (holiday) {
      throw new BadRequestException(`Today is a holiday — ${holiday.name}`);
    }

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing?.checkIn) {
      throw new ConflictException('You have already checked in today');
    }
    if (existing?.status === 'ON_LEAVE') {
      throw new BadRequestException('You are on approved leave today');
    }

    const status = statusAtCheckIn(now, this.policy);

    // Upsert, not create — the nightly job may have written an ABSENT row
    // for someone arriving very late.
    return this.decorate(
      await this.prisma.attendance.upsert({
        where: { employeeId_date: { employeeId, date: today } },
        create: { employeeId, date: today, checkIn: now, status },
        update: { checkIn: now, status },
      }),
    );
  }

  async checkOut(user: JwtUser) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());
    const now = new Date();

    const record = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (!record?.checkIn) {
      throw new BadRequestException('You have not checked in today');
    }
    if (record.checkOut) {
      throw new ConflictException('You have already checked out today');
    }

    const mins = minutesWorked(record.checkIn, now)!;
    const status = statusAtCheckOut(
      record.status === 'LATE' ? 'LATE' : 'PRESENT',
      mins,
      this.policy,
    );

    return this.decorate(
      await this.prisma.attendance.update({
        where: { id: record.id },
        data: { checkOut: now, status },
      }),
    );
  }

  /** Drives the check-in button's state. */
  async today(user: JwtUser) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());

    const [record, holiday] = await Promise.all([
      this.prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: today } },
      }),
      this.prisma.holiday.findUnique({ where: { date: today } }),
    ]);

    const weekend = isWeekend(today, this.policy.weekendDays);

    return {
      date: today,
      isWeekend: weekend,
      holiday: holiday ? { name: holiday.name } : null,
      canCheckIn: !weekend && !holiday && !record?.checkIn && record?.status !== 'ON_LEAVE',
      canCheckOut: !!record?.checkIn && !record.checkOut,
      record: record ? this.decorate(record) : null,
    };
  }

  // ── Reading ─────────────────────────────────────────────────────────

  /** A month of records for one employee, with the month's totals. */
  async monthFor(employeeId: number, query: MonthQueryDto) {
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));

    const [rows, holidays] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { employeeId, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
    ]);

    return {
      year,
      month,
      daysInMonth: to.getUTCDate(),
      holidays: holidays.map((h) => ({
        date: h.date.toISOString().slice(0, 10), name: h.name,
      })),
      weekendDays: this.policy.weekendDays,
      records: rows.map((r) => this.decorate(r)),
      totals: totalsFrom(rows, this.policy),
    };
  }

  /** Rolling-window summary — what the leave decision panel reads. */
  async summaryFor(employeeId: number, windowDays = 90) {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - windowDays);

    const rows = await this.prisma.attendance.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      select: { status: true, checkIn: true, checkOut: true },
    });
    return { windowDays, ...totalsFrom(rows, this.policy) };
  }

  /** The daily register — everyone's status for one date. */
  async register(dto: ListAttendanceDto) {
    const date = dateOnly(dto.date ?? new Date());

    const [employees, records, holiday] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          employmentStatus: 'ACTIVE',
          ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
          ...(dto.search
            ? {
                OR: [
                  { firstName: { contains: dto.search } },
                  { lastName: { contains: dto.search } },
                  { employeeCode: { contains: dto.search } },
                ],
              }
            : {}),
        },
        select: EMPLOYEE_SELECT,
        orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
      }),
      this.prisma.attendance.findMany({ where: { date } }),
      this.prisma.holiday.findUnique({ where: { date } }),
    ]);

    const byEmployee = new Map(records.map((r) => [r.employeeId, r]));

    // An employee with no row is "not marked yet", which is different from
    // absent — the nightly job is what turns one into the other.
    const rows = employees
      .map((e) => {
        const record = byEmployee.get(e.id);
        return {
          employee: e,
          record: record ? this.decorate(record) : null,
          status: record?.status ?? 'NOT_MARKED',
        };
      })
      .filter((r) => !dto.status || r.status === dto.status);

    const counts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      date,
      isWeekend: isWeekend(date, this.policy.weekendDays),
      holiday: holiday ? { name: holiday.name } : null,
      counts,
      total: rows.length,
      rows,
    };
  }

  /** Per-employee totals across a range — the HR summary table. */
  async organisationSummary(from: Date, to: Date, departmentId?: number) {
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        ...(departmentId ? { departmentId } : {}),
      },
      select: {
        ...EMPLOYEE_SELECT,
        attendance: {
          where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
          select: { status: true, checkIn: true, checkOut: true },
        },
      },
      orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
    });

    return employees.map((e) => {
      const { attendance, ...employee } = e;
      return { employee, totals: totalsFrom(attendance, this.policy) };
    });
  }

  // ── Corrections ─────────────────────────────────────────────────────

  async correct(actor: JwtUser, id: number, dto: CorrectAttendanceDto) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Attendance record not found');

    const before = {
      checkIn: record.checkIn, checkOut: record.checkOut, status: record.status,
    };

    const checkIn = dto.checkIn ? this.combine(record.date, dto.checkIn) : record.checkIn;
    const checkOut = dto.checkOut ? this.combine(record.date, dto.checkOut) : record.checkOut;

    if (checkIn && checkOut && checkOut <= checkIn) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    // If HR set times but no status, re-derive it rather than leaving a
    // record whose status contradicts its own timestamps.
    let status = dto.status ?? record.status;
    if (!dto.status && checkIn) {
      const base = statusAtCheckIn(checkIn, this.policy);
      status = checkOut
        ? statusAtCheckOut(base, minutesWorked(checkIn, checkOut)!, this.policy)
        : base;
    }

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: { checkIn, checkOut, status },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.sub,
        action: 'ATTENDANCE_CORRECTED',
        entity: 'attendance',
        entityId: id,
        metadata: {
          reason: dto.reason,
          before: {
            checkIn: before.checkIn?.toISOString() ?? null,
            checkOut: before.checkOut?.toISOString() ?? null,
            status: before.status,
          },
          after: {
            checkIn: checkIn?.toISOString() ?? null,
            checkOut: checkOut?.toISOString() ?? null,
            status,
          },
        },
      },
    });

    return this.decorate(updated);
  }

  async upsertForEmployee(actor: JwtUser, dto: UpsertAttendanceDto) {
    const date = dateOnly(dto.date);
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId }, select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const checkIn = dto.checkIn ? this.combine(date, dto.checkIn) : null;
    const checkOut = dto.checkOut ? this.combine(date, dto.checkOut) : null;
    if (checkIn && checkOut && checkOut <= checkIn) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    const record = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      create: { employeeId: dto.employeeId, date, checkIn, checkOut, status: dto.status },
      update: { checkIn, checkOut, status: dto.status },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.sub,
        action: 'ATTENDANCE_SET',
        entity: 'attendance',
        entityId: record.id,
        metadata: { reason: dto.reason, status: dto.status, date: dto.date },
      },
    });

    return this.decorate(record);
  }

  /** Recent corrections, for the audit screen. */
  async corrections(limit = 50) {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: { in: ['ATTENDANCE_CORRECTED', 'ATTENDANCE_SET'] } },
      orderBy: { id: 'desc' },
      take: limit,
    });

    const actorIds = [...new Set(logs.map((l) => l.actorUserId))];
    const recordIds = [...new Set(logs.map((l) => l.entityId))];

    const [actors, records] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true, email: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { id: { in: recordIds } },
        select: {
          id: true, date: true,
          employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        },
      }),
    ]);

    const actorById = new Map(actors.map((a) => [a.id, a]));
    const recordById = new Map(records.map((r) => [r.id, r]));

    return logs.map((l) => ({
      id: Number(l.id),
      action: l.action,
      createdAt: l.createdAt,
      metadata: l.metadata,
      actor: actorById.get(l.actorUserId) ?? null,
      record: recordById.get(l.entityId) ?? null,
    }));
  }

  // ── Holidays ────────────────────────────────────────────────────────

  holidays(year?: number) {
    const y = year ?? new Date().getFullYear();
    return this.prisma.holiday.findMany({
      where: {
        date: { gte: new Date(Date.UTC(y, 0, 1)), lte: new Date(Date.UTC(y, 11, 31)) },
      },
      orderBy: { date: 'asc' },
    });
  }

  async createHoliday(dto: CreateHolidayDto) {
    const date = dateOnly(dto.date);
    const clash = await this.prisma.holiday.findUnique({ where: { date } });
    if (clash) throw new ConflictException(`${clash.name} is already set for that date`);

    const holiday = await this.prisma.holiday.create({ data: { date, name: dto.name } });

    // Mark it on any attendance already recorded, so the day stops counting
    // against people who were marked absent before it was declared.
    await this.prisma.attendance.updateMany({
      where: { date, status: { in: ['ABSENT'] } },
      data: { status: 'HOLIDAY' },
    });

    return holiday;
  }

  async deleteHoliday(id: number) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    return { message: `${holiday.name} removed` };
  }

  // ── Nightly absentee job ────────────────────────────────────────────

  /**
   * Turns "no row" into ABSENT for the day just finished.
   *
   * Without this, a missing row is ambiguous between "absent" and "not
   * processed yet", and every report built on attendance quietly lies.
   */
  @Cron('55 23 * * *')
  async markAbsentees(forDate?: Date) {
    const date = dateOnly(forDate ?? new Date());

    if (isWeekend(date, this.policy.weekendDays)) return { marked: 0, reason: 'weekend' };
    const holiday = await this.prisma.holiday.findUnique({ where: { date } });
    if (holiday) return { marked: 0, reason: 'holiday' };

    const [employees, existing] = await Promise.all([
      this.prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE' }, select: { id: true },
      }),
      this.prisma.attendance.findMany({ where: { date }, select: { employeeId: true } }),
    ]);

    const marked = new Set(existing.map((r) => r.employeeId));
    const missing = employees.filter((e) => !marked.has(e.id));

    if (missing.length) {
      await this.prisma.attendance.createMany({
        data: missing.map((e) => ({ employeeId: e.id, date, status: 'ABSENT' as const })),
        skipDuplicates: true,
      });
    }

    this.logger.log(`Marked ${missing.length} absent for ${date.toISOString().slice(0, 10)}`);
    return { marked: missing.length, date };
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Adds the derived figures the client needs but the table never stores. */
  private decorate<T extends { checkIn: Date | null; checkOut: Date | null }>(r: T) {
    const mins = minutesWorked(r.checkIn, r.checkOut);
    return {
      ...r,
      minutesWorked: mins,
      overtimeMinutes: overtimeMinutes(mins, this.policy),
    };
  }

  /** "17:30" on a stored DATE becomes a full timestamp on that day. */
  private combine(date: Date, hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private requireEmployee(user: JwtUser): number {
    if (!user.employeeId) {
      throw new BadRequestException(
        'This account has no employee record, so it cannot mark attendance',
      );
    }
    return user.employeeId;
  }

  /** Exposed for the working-days calculation in reports. */
  async workingDaysBetween(from: Date, to: Date) {
    const holidays = await this.prisma.holiday.findMany({
      where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
      select: { date: true },
    });
    return workingDatesIn(
      from, to, this.policy,
      new Set(holidays.map((h) => h.date.toISOString().slice(0, 10))),
    ).length;
  }
}
