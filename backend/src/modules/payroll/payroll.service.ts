import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import {
  totalsFrom, dateOnly, workingDatesIn,
} from '../attendance/attendance-policy.js';
import {
  calculateNetSalary, describeUnpaidLeave, flagPayslip,
  monthHasEnded, payrollMonthName, payrollOpensOn, round2,
  type PayrollResult, type UnpaidLeaveSpell,
} from './payroll-policy.js';
import type { AdjustPayslipDto, UpdateSalaryDto } from './dto/payroll.dto.js';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly attendance: AttendanceService,
  ) {}

  // ── Runs ────────────────────────────────────────────────────────────

  listRuns() {
    return this.prisma.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
      include: {
        _count: { select: { payslips: true } },
        processor: {
          select: { email: true, employee: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  /**
   * Builds a DRAFT run: a payslip for every active employee, calculated from
   * attendance, leave and dues. Nothing is issued and nothing is deducted —
   * this is the preview HR checks before an administrator signs it off.
   */
  /**
   * Creates a DRAFT for a month, finished or not.
   *
   * A draft for a month still running is a forecast: useful to see where
   * payroll is heading, and safe because nothing is issued. What it must
   * not become is a payment — `finaliseRun` refuses until the month is
   * over, which is the irreversible step and therefore the one that needs
   * the guard.
   */
  async createRun(user: JwtUser, month: number, year: number) {
    const existing = await this.prisma.payrollRun.findUnique({
      where: { month_year: { month, year } },
    });
    if (existing) {
      throw new ConflictException(
        existing.status === 'FINALISED'
          ? 'Payroll for that month has already been finalised'
          : 'A draft already exists for that month. Open or delete it first.',
      );
    }

    const computed = await this.computeMonth(month, year);

    const run = await this.prisma.payrollRun.create({
      data: { month, year, status: 'DRAFT' },
    });

    for (const [employeeId, row] of computed) {
      await this.prisma.payslip.create({
        data: { payrollRunId: run.id, employeeId, ...row },
      });
    }

    this.logger.log(
      `Draft payroll ${year}-${month} created by ${user.email}: ${computed.size} payslips`,
    );
    return this.getRun(run.id);
  }

  /**
   * Recalculates every payslip in a draft from the records as they stand.
   *
   * This is what a draft for a running month needs to be useful, and what
   * a stale draft needs to become correct: leave approved since, attendance
   * recorded since, a salary changed since, all picked up.
   *
   * Bonus and other deductions are NOT recomputed. Those are HR's figures
   * with HR's reasons, and losing them to a refresh would make the button
   * unusable on any run somebody had already worked on.
   */
  async recalculate(user: JwtUser, runId: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { payslips: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'FINALISED') {
      throw new BadRequestException(
        'A finalised run cannot be recalculated. Payslips are financial records.',
      );
    }

    const computed = await this.computeMonth(run.month, run.year);
    const existing = new Map(run.payslips.map((p) => [p.employeeId, p]));

    let updated = 0;
    let added = 0;

    for (const [employeeId, row] of computed) {
      const slip = existing.get(employeeId);

      if (!slip) {
        // Somebody hired into the month since the draft was made.
        await this.prisma.payslip.create({
          data: { payrollRunId: run.id, employeeId, ...row },
        });
        added += 1;
        continue;
      }

      // Re-run the whole calculation with HR's own figures put back, so the
      // dues cap and the net are consistent with the new deductions rather
      // than patched on top of the old ones.
      const bonus = Number(slip.bonus);
      const otherDeductions = Number(slip.otherDeductions);
      const gross = round2(
        row.baseSalary + row.allowances + row.overtimeAmount + bonus,
      );
      const beforeDues = round2(gross - row.unpaidLeaveDeduction - otherDeductions);
      const duesDeduction = round2(
        Math.min(row.duesDeduction, Math.max(0, beforeDues)),
      );

      await this.prisma.payslip.update({
        where: { id: slip.id },
        data: {
          ...row,
          bonus,
          otherDeductions,
          duesDeduction,
          netSalary: round2(Math.max(0, beforeDues - duesDeduction)),
        },
      });
      updated += 1;
    }

    await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: { recalculatedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.sub,
        action: 'PAYROLL_RECALCULATED',
        entity: 'payroll_run',
        entityId: run.id,
        metadata: { updated, added },
      },
    }).catch(() => undefined);

    this.logger.log(
      `Payroll ${run.year}-${run.month} recalculated by ${user.email}: ` +
        `${updated} updated, ${added} added`,
    );
    return this.getRun(run.id);
  }

  /**
   * Every payslip for a month, calculated from the records as they stand.
   *
   * Shared by creation and recalculation so the two cannot drift: a refresh
   * that computed anything differently from the original would be a second
   * payroll engine, and only one of them would be the tested one.
   */
  private async computeMonth(month: number, year: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const workingDaysInMonth = await this.attendance.workingDaysBetween(from, to);

    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] },
        // Somebody who joined after the month ended was not employed then.
        joiningDate: { lte: to },
      },
      include: {
        attendance: { where: { date: { gte: from, lte: to } } },
        dues: { where: { status: 'ACTIVE' }, include: { payments: true } },
      },
    });

    if (employees.length === 0) {
      throw new BadRequestException('There are no employees to pay for that month');
    }

    const unpaidLeave = await this.unpaidLeaveByEmployee(from, to);
    const policy = this.attendance.policy;
    const rows = new Map<number, ReturnType<typeof this.toColumns> &
      { leaveDeductionNote: string | null }>();

    for (const e of employees) {
      const totals = totalsFrom(e.attendance, policy);

      // Oldest dues first, so a long-standing debt clears before a new one.
      const installment = e.dues
        .sort((a, b) => a.issuedOn.getTime() - b.issuedOn.getTime())
        .reduce((sum, d) => {
          const paid = d.payments.reduce((acc, p) => acc + Number(p.amount), 0);
          const remaining = Number(d.principalAmount) - paid;
          return sum + Math.max(0, Math.min(Number(d.monthlyInstallment), remaining));
        }, 0);

      const result = calculateNetSalary({
        baseSalary: Number(e.baseSalary),
        allowances: Number(e.allowances),
        overtimeMinutes: totals.overtimeMinutes,
        unpaidLeaveDays: unpaidLeave.get(e.id)?.days ?? 0,
        workingDaysInMonth,
        payableDays: this.payableDays(e.joiningDate, from, to, workingDaysInMonth),
        standardWorkHours: policy.standardWorkHours,
        overtimeRateMultiplier: policy.overtimeRateMultiplier,
        duesInstallment: installment,
        bonus: 0,
        otherDeductions: 0,
      });

      const unpaid = unpaidLeave.get(e.id);

      rows.set(e.id, {
        ...this.toColumns(result),
        // Produced with the figure it explains, so the two always describe
        // the same calculation.
        leaveDeductionNote: unpaid
          ? describeUnpaidLeave(unpaid.spells, result.workings.perDayRate)
          : null,
      });
    }

    return rows;
  }

  async getRun(id: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        processor: {
          select: { email: true, employee: { select: { firstName: true, lastName: true } } },
        },
        payslips: {
          include: {
            employee: {
              select: {
                id: true, employeeCode: true, firstName: true, lastName: true,
                designation: true, joiningDate: true, baseSalary: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { employeeId: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');

    // Last month's net, to flag anything that moved sharply.
    const previous = await this.previousNetByEmployee(run.month, run.year);

    const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
    const monthEnd = new Date(Date.UTC(run.year, run.month, 0));
    const workingDaysInMonth = await this.attendance.workingDaysBetween(monthStart, monthEnd);

    const payslips = run.payslips.map((p) => {
      const figures = this.numeric(p);
      const joined = p.employee.joiningDate;

      // A payslip smaller than the employee's salary is not an error — it is
      // someone who joined partway through the month. Say so explicitly,
      // because an unexplained small figure on a payslip looks like a bug.
      const payableDays =
        joined > monthStart && joined <= monthEnd
          ? this.payableDays(joined, monthStart, monthEnd, workingDaysInMonth)
          : undefined;

      return {
        ...p,
        ...figures,
        proRata:
          payableDays !== undefined && payableDays < workingDaysInMonth
            ? {
                joined: joined.toISOString().slice(0, 10),
                payableDays,
                workingDaysInMonth,
                fullBaseSalary: Number(p.employee.baseSalary),
              }
            : null,
        flags: flagPayslip(figures, previous.get(p.employeeId) ?? null),
      };
    });

    const totals = payslips.reduce(
      (acc, p) => ({
        gross: round2(acc.gross + p.baseSalary + p.allowances + p.overtimeAmount + p.bonus),
        deductions: round2(
          acc.deductions + p.unpaidLeaveDeduction + p.otherDeductions + p.duesDeduction,
        ),
        net: round2(acc.net + p.netSalary),
        overtime: round2(acc.overtime + p.overtimeAmount),
        duesRecovered: round2(acc.duesRecovered + p.duesDeduction),
      }),
      { gross: 0, deductions: 0, net: 0, overtime: 0, duesRecovered: 0 },
    );

    return {
      ...run,
      payslips,
      totals,
      flaggedCount: payslips.filter((p) => p.flags.length > 0).length,
      staleness: await this.draftStaleness(run),
      // A draft for a month still running is a forecast, and the screen
      // says so rather than presenting provisional figures as final.
      monthComplete: monthHasEnded(run.month, run.year, new Date()),
      opensOn: payrollOpensOn(run.month, run.year).toISOString().slice(0, 10),
    };
  }

  /**
   * Whether the draft still matches the records it was calculated from.
   *
   * A payslip is a snapshot taken when the run is created, and nothing
   * recomputes it afterwards. Leave approved later — which now happens
   * without a person, so nobody is watching — would be missing from a
   * payslip that gets finalised and cannot be reopened.
   *
   * Returns null for a finalised run: it is history by then, and the
   * correct place for a late item is the next month, not this one.
   */
  private async draftStaleness(run: { id: number; month: number; year: number;
    status: string; createdAt: Date; recalculatedAt: Date | null }) {
    if (run.status !== 'DRAFT') return null;

    // Measured from the last time the figures were produced, not from when
    // the run was first made — otherwise a draft reports itself out of date
    // for ever, immediately after being brought up to date.
    const since = run.recalculatedAt ?? run.createdAt;

    const from = new Date(Date.UTC(run.year, run.month - 1, 1));
    const to = new Date(Date.UTC(run.year, run.month, 0));

    const [leaveApproved, attendanceAdded] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: {
          status: 'APPROVED',
          leaveType: { isPaid: false },
          startDate: { lte: to },
          endDate: { gte: from },
          // Approved after the figures were produced, so its deduction is
          // not in any payslip here.
          reviewedAt: { gt: since },
        },
      }),
      this.prisma.attendance.count({
        where: { date: { gte: from, lte: to }, createdAt: { gt: since } },
      }),
    ]);

    if (leaveApproved === 0 && attendanceAdded === 0) return null;

    const parts: string[] = [];
    if (leaveApproved > 0) {
      parts.push(
        `${leaveApproved} unpaid leave request${leaveApproved === 1 ? '' : 's'} approved`,
      );
    }
    if (attendanceAdded > 0) {
      parts.push(
        `${attendanceAdded} attendance record${attendanceAdded === 1 ? '' : 's'} added`,
      );
    }

    return {
      leaveApproved,
      attendanceAdded,
      message:
        `${parts.join(' and ')} since this draft was calculated. ` +
        `Those figures are not in it yet — recalculate to pick them up. ` +
        `Bonuses and other deductions you have entered are kept.`,
    };
  }

  async deleteRun(id: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'FINALISED') {
      throw new BadRequestException(
        'A finalised run cannot be deleted. Payslips are financial records.',
      );
    }
    await this.prisma.payrollRun.delete({ where: { id } });
    return { message: 'Draft deleted' };
  }

  /** Adjust a bonus or deduction while the run is still DRAFT. */
  async adjustPayslip(user: JwtUser, runId: number, payslipId: number, dto: AdjustPayslipDto) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'FINALISED') {
      throw new BadRequestException('A finalised payslip cannot be changed');
    }

    const slip = await this.prisma.payslip.findUnique({ where: { id: payslipId } });
    if (!slip || slip.payrollRunId !== runId) {
      throw new NotFoundException('Payslip not found in this run');
    }

    // Recompute the total from the stored components rather than patching
    // net directly — otherwise the parts stop adding up to the whole. The
    // attendance-derived pieces are not touched here; only what HR changed.
    const bonus = round2(dto.bonus ?? Number(slip.bonus));
    const otherDeductions = round2(dto.otherDeductions ?? Number(slip.otherDeductions));

    // A figure without a reason is one nobody can answer a question about
    // six months later. Required only when there is something to explain:
    // clearing an amount back to zero needs no justification.
    const bonusReason = dto.bonusReason?.trim() || slip.bonusReason;
    const otherDeductionsReason =
      dto.otherDeductionsReason?.trim() || slip.otherDeductionsReason;

    if (bonus > 0 && !bonusReason) {
      throw new BadRequestException('Say what the bonus is for');
    }
    if (otherDeductions > 0 && !otherDeductionsReason) {
      throw new BadRequestException('Say what is being deducted and why');
    }

    const gross = round2(
      Number(slip.baseSalary) + Number(slip.allowances) +
      Number(slip.overtimeAmount) + bonus,
    );
    const beforeDues = round2(gross - Number(slip.unpaidLeaveDeduction) - otherDeductions);

    // Raising a deduction can leave less room for dues recovery, so the
    // installment is re-capped rather than left at the old figure.
    const requested = Number(slip.duesDeduction);
    const duesDeduction = round2(Math.min(requested, Math.max(0, beforeDues)));
    const netSalary = round2(Math.max(0, beforeDues - duesDeduction));

    const updated = await this.prisma.payslip.update({
      where: { id: payslipId },
      data: {
        bonus, otherDeductions, duesDeduction, netSalary,
        // Cleared back to zero: drop the reason with the figure rather than
        // leaving an explanation for an amount that is no longer there.
        bonusReason: bonus > 0 ? bonusReason : null,
        otherDeductionsReason: otherDeductions > 0 ? otherDeductionsReason : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.sub,
        action: 'PAYSLIP_ADJUSTED',
        entity: 'payslip',
        entityId: payslipId,
        metadata: {
          bonusReason: bonus > 0 ? bonusReason : null,
          otherDeductionsReason: otherDeductions > 0 ? otherDeductionsReason : null,
          before: {
            bonus: Number(slip.bonus),
            otherDeductions: Number(slip.otherDeductions),
            netSalary: Number(slip.netSalary),
          },
          after: { bonus, otherDeductions, duesDeduction, netSalary },
        },
      },
    });

    return this.numeric(updated);
  }

  /**
   * Issues the run. Irreversible, and ADMIN only.
   *
   * Everything happens in one transaction: payslips are frozen, dues
   * payments recorded, cleared dues closed and employees notified. A crash
   * partway through would otherwise leave money recorded as recovered
   * against a run that was never issued.
   */
  async finaliseRun(user: JwtUser, id: number) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an administrator can finalise payroll');
    }

    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            employee: {
              select: {
                id: true, firstName: true,
                user: { select: { id: true } },
                dues: { where: { status: 'ACTIVE' }, include: { payments: true } },
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'FINALISED') {
      throw new BadRequestException('This run has already been finalised');
    }
    if (run.payslips.length === 0) {
      throw new BadRequestException('This run has no payslips');
    }

    // The month has to be over before it can be paid. Overtime and unpaid
    // leave accumulate through it, so a month still running cannot have a
    // final figure — a draft of one is a forecast, and finalising would
    // turn a forecast into a payment nobody can take back.
    if (!monthHasEnded(run.month, run.year, new Date())) {
      const name = payrollMonthName(run.month, run.year);
      const opens = payrollOpensOn(run.month, run.year);
      throw new BadRequestException(
        `${name} is not over yet, so these figures are still a forecast. ` +
          `Payroll runs in arrears: this can be finalised from ` +
          `${opens.toISOString().slice(0, 10)} onwards, once overtime, leave ` +
          `and attendance for the month are complete.`,
      );
    }

    // The last point at which this is still fixable. Finalising freezes
    // every figure and recovers dues, and there is no way back — so a draft
    // that no longer matches the records is stopped here rather than paying
    // somebody an amount the system can already see is out of date.
    const stale = await this.draftStaleness(run);
    if (stale) {
      throw new BadRequestException(`Cannot finalise — ${stale.message}`);
    }

    const paidOn = dateOnly(new Date(Date.UTC(run.year, run.month, 0)));
    const monthName = new Intl.DateTimeFormat('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(run.year, run.month - 1, 1)));

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'FINALISED', processedBy: user.sub, processedAt: new Date() },
      });

      for (const slip of run.payslips) {
        let toRecover = Number(slip.duesDeduction);

        // Spread the recovery across dues, oldest first, and close any that
        // reach zero.
        for (const due of slip.employee.dues.sort(
          (a, b) => a.issuedOn.getTime() - b.issuedOn.getTime(),
        )) {
          if (toRecover <= 0) break;
          const paid = due.payments.reduce((acc, p) => acc + Number(p.amount), 0);
          const remaining = round2(Number(due.principalAmount) - paid);
          if (remaining <= 0) continue;

          const amount = round2(Math.min(toRecover, remaining));
          await tx.duePayment.create({
            data: { dueId: due.id, payslipId: slip.id, amount, paidOn },
          });
          toRecover = round2(toRecover - amount);

          if (round2(remaining - amount) <= 0) {
            await tx.due.update({ where: { id: due.id }, data: { status: 'CLEARED' } });
          }
        }

        if (slip.employee.user) {
          await tx.notification.create({
            data: {
              userId: slip.employee.user.id,
              type: 'PAYROLL',
              title: `Payslip for ${monthName}`,
              body: `Your ${monthName} payslip is ready. Net pay ${Number(slip.netSalary).toFixed(2)}.`,
              link: '/payroll',
            },
          });
        }
      }
    });

    this.logger.log(`Payroll ${run.year}-${run.month} finalised by ${user.email}`);
    return this.getRun(id);
  }

  // ── Payslips ────────────────────────────────────────────────────────

  /**
   * A payslip is a document someone shows a bank or a landlord, so it needs
   * everything that identifies it — not just the figures.
   */
  async myPayslips(employeeId: number) {
    const slips = await this.prisma.payslip.findMany({
      where: { employeeId, payrollRun: { status: 'FINALISED' } },
      include: {
        payrollRun: { select: { month: true, year: true, processedAt: true } },
        employee: {
          select: {
            employeeCode: true, firstName: true, lastName: true, email: true,
            designation: true, joiningDate: true, baseSalary: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }],
      take: 24,
    });

    // Working days per period, so the payslip can state what was paid for.
    const periods = await Promise.all(
      slips.map(async (p) => {
        const from = new Date(Date.UTC(p.payrollRun.year, p.payrollRun.month - 1, 1));
        const to = new Date(Date.UTC(p.payrollRun.year, p.payrollRun.month, 0));
        const workingDays = await this.attendance.workingDaysBetween(from, to);
        const payable = this.payableDays(p.employee.joiningDate, from, to, workingDays);
        return {
          periodStart: from.toISOString().slice(0, 10),
          periodEnd: to.toISOString().slice(0, 10),
          workingDays,
          paidDays: payable ?? workingDays,
        };
      }),
    );

    return slips.map((p, i) => ({
      ...p,
      ...this.numeric(p),
      employee: { ...p.employee, baseSalary: Number(p.employee.baseSalary) },
      period: periods[i],
    }));
  }

  async getPayslip(user: JwtUser, id: number) {
    const slip = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        payrollRun: true,
        employee: {
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true,
            designation: true, department: { select: { name: true } },
          },
        },
      },
    });
    if (!slip) throw new NotFoundException('Payslip not found');

    const isOwner = slip.employeeId === user.employeeId;
    const isHr = user.role === Role.HR || user.role === Role.ADMIN;
    if (!isOwner && !isHr) throw new ForbiddenException();

    // An employee must not see a payslip from a run that has not been issued.
    if (!isHr && slip.payrollRun.status !== 'FINALISED') {
      throw new NotFoundException('Payslip not found');
    }

    return { ...slip, ...this.numeric(slip) };
  }

  /** Two payslips side by side — what the AI explanation reads. */
  async comparePayslips(employeeId: number, month: number, year: number) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const [current, previous] = await Promise.all([
      this.prisma.payslip.findFirst({
        where: { employeeId, payrollRun: { month, year } },
      }),
      this.prisma.payslip.findFirst({
        where: { employeeId, payrollRun: { month: prevMonth, year: prevYear } },
      }),
    ]);
    if (!current) throw new NotFoundException('No payslip for that month');

    const a = this.numeric(current);
    const b = previous ? this.numeric(previous) : null;
    if (!b) return { current: a, previous: null, differences: [] };

    // The differences are computed here, so the model never subtracts.
    const fields = [
      ['baseSalary', 'Base salary'], ['allowances', 'Allowances'],
      ['overtimeAmount', 'Overtime'], ['bonus', 'Bonus'],
      ['unpaidLeaveDeduction', 'Unpaid leave'], ['otherDeductions', 'Other deductions'],
      ['duesDeduction', 'Dues recovered'], ['netSalary', 'Net salary'],
    ] as const;

    return {
      current: a,
      previous: b,
      differences: fields
        .map(([key, label]) => ({ field: label, from: b[key], to: a[key], change: round2(a[key] - b[key]) }))
        .filter((d) => d.change !== 0),
    };
  }

  // ── Salary structure ────────────────────────────────────────────────

  async updateSalary(user: JwtUser, employeeId: number, dto: UpdateSalaryDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { baseSalary: dto.baseSalary, allowances: dto.allowances },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        baseSalary: true, allowances: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.sub,
        action: 'SALARY_CHANGED',
        entity: 'employee',
        entityId: employeeId,
        metadata: {
          reason: dto.reason,
          before: { baseSalary: Number(employee.baseSalary), allowances: Number(employee.allowances) },
          after: { baseSalary: dto.baseSalary, allowances: dto.allowances },
        },
      },
    });

    return { ...updated, baseSalary: Number(updated.baseSalary), allowances: Number(updated.allowances) };
  }

  salaryStructure() {
    return this.prisma.employee
      .findMany({
        where: { employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } },
        select: {
          id: true, employeeCode: true, firstName: true, lastName: true,
          designation: true, baseSalary: true, allowances: true,
          department: { select: { name: true } },
        },
        orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
      })
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          baseSalary: Number(r.baseSalary),
          allowances: Number(r.allowances),
          monthlyCost: round2(Number(r.baseSalary) + Number(r.allowances)),
        })),
      );
  }

  // ── Internals ───────────────────────────────────────────────────────

  /**
   * Unpaid leave in this month, per employee, with the detail behind it.
   *
   * Each spell is clipped to the payroll month and re-counted in working
   * days. Previously the stored `days` of the whole request was added to
   * every month the request touched, so a week off across month end was
   * deducted twice — once in full from each payslip. Clipping is what makes
   * the figure match the employee's own calendar.
   */
  private async unpaidLeaveByEmployee(from: Date, to: Date) {
    const [leave, holidayRows] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          leaveType: { isPaid: false },
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: {
          employeeId: true, startDate: true, endDate: true,
          leaveType: { select: { name: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.holiday.findMany({
        where: { date: { gte: from, lte: to } },
        select: { date: true },
      }),
    ]);

    const holidays = new Set(
      holidayRows.map((h) => h.date.toISOString().slice(0, 10)),
    );
    const policy = this.attendance.policy;

    const map = new Map<number, { days: number; spells: UnpaidLeaveSpell[] }>();
    for (const l of leave) {
      const start = l.startDate < from ? from : l.startDate;
      const end = l.endDate > to ? to : l.endDate;
      // Weekends and holidays inside a spell were never working days, so
      // they are not pay to withhold.
      const dates = workingDatesIn(start, end, policy, holidays);
      if (dates.length === 0) continue;

      const entry = map.get(l.employeeId) ?? { days: 0, spells: [] };
      entry.days += dates.length;
      entry.spells.push({
        leaveType: l.leaveType.name,
        // The first and last days actually withheld, not the clip
        // boundaries. A spell ending on the 31st when the 31st is a
        // Saturday reads as four days against a figure of three.
        from: dates[0],
        to: dates[dates.length - 1],
        days: dates.length,
      });
      map.set(l.employeeId, entry);
    }
    return map;
  }

  private async previousNetByEmployee(month: number, year: number) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const slips = await this.prisma.payslip.findMany({
      where: { payrollRun: { month: prevMonth, year: prevYear } },
      select: { employeeId: true, netSalary: true },
    });
    return new Map(slips.map((s) => [s.employeeId, Number(s.netSalary)]));
  }

  /** Working days the employee was actually employed, for a mid-month joiner. */
  private payableDays(joiningDate: Date, from: Date, to: Date, workingDays: number) {
    if (joiningDate <= from) return undefined;
    if (joiningDate > to) return 0;
    const totalDays = to.getUTCDate();
    const employedDays = totalDays - joiningDate.getUTCDate() + 1;
    return Math.round((employedDays / totalDays) * workingDays);
  }

  private toColumns(r: PayrollResult) {
    return {
      baseSalary: r.baseSalary,
      allowances: r.allowances,
      overtimeAmount: r.overtimeAmount,
      unpaidLeaveDeduction: r.unpaidLeaveDeduction,
      otherDeductions: r.otherDeductions,
      duesDeduction: r.duesDeduction,
      bonus: r.bonus,
      netSalary: r.netSalary,
    };
  }

  private numeric<T extends Record<string, unknown>>(p: T) {
    const n = (v: unknown) => Number(v ?? 0);
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      // The three explanations travel with the figures they explain. A
      // response carrying an amount without its reason is one the caller
      // has to make a second request to understand.
      leaveDeductionNote: text(p.leaveDeductionNote),
      bonusReason: text(p.bonusReason),
      otherDeductionsReason: text(p.otherDeductionsReason),
      baseSalary: n(p.baseSalary),
      allowances: n(p.allowances),
      overtimeAmount: n(p.overtimeAmount),
      unpaidLeaveDeduction: n(p.unpaidLeaveDeduction),
      otherDeductions: n(p.otherDeductions),
      duesDeduction: n(p.duesDeduction),
      bonus: n(p.bonus),
      netSalary: n(p.netSalary),
      gross: round2(n(p.baseSalary) + n(p.allowances) + n(p.overtimeAmount) + n(p.bonus)),
      totalDeductions: round2(
        n(p.unpaidLeaveDeduction) + n(p.otherDeductions) + n(p.duesDeduction),
      ),
    };
  }

}
