import { Role } from '../../../common/enums/role.enum.js';
import {
  minutesWorked,
  overtimeMinutes,
} from '../../attendance/attendance-policy.js';
import type {
  ComputeContext,
  EntityDefinition,
  EntityRegistry,
  Row,
} from './entity-definition.js';

/**
 * The registry. THIS IS THE FILE YOU EDIT when the system grows.
 *
 * Add a table here and every question about it starts working at once —
 * filter it, group it, aggregate it, join it to department. No new tool, no
 * executor branch, no change to the role filter, no prompt rewrite. The
 * catalogue the model reads is generated from this file, so the assistant
 * learns the new data the moment it is declared.
 *
 * Two lines carry the security of the whole thing:
 *   roles        — who may touch this entity at all
 *   seesEveryone — who sees rows other than their own; everybody else is
 *                  pinned to `ownedVia` by the translator, from the session.
 */

const EVERYONE = [Role.EMPLOYEE, Role.HR, Role.ADMIN] as const;
const HR_UP = [Role.HR, Role.ADMIN] as const;

/** Counting rows is meaningful for every entity, so nobody declares it. */
function defineEntity(def: EntityDefinition): EntityDefinition {
  return {
    ...def,
    metrics: {
      count: { agg: 'count', describe: 'Number of records' },
      ...def.metrics,
    },
  };
}

/** Prisma hands back Decimal objects; every arithmetic path goes through this. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asDate(value: unknown): Date | null {
  return value instanceof Date ? value : null;
}

/** Minutes worked on one attendance row, or null if the day is not finished. */
function workedOn(row: Row): number | null {
  return minutesWorked(asDate(row.checkIn), asDate(row.checkOut));
}

export const REGISTRY: EntityRegistry = {
  // ─── Attendance ───────────────────────────────────────────────────

  attendance: defineEntity({
    model: 'attendance',
    describe: 'One row per employee per day: the status recorded, and the check-in and check-out times.',
    access: {
      roles: EVERYONE,
      seesEveryone: HR_UP,
      ownedVia: 'employeeId',
    },
    fields: {
      date: { type: 'date' },
      status: {
        type: 'enum',
        values: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY'],
      },
      checkIn: { type: 'date', describe: 'Time of arrival' },
      checkOut: { type: 'date', describe: 'Time of departure' },
      employeeName: { type: 'string', path: 'employee.firstName', describe: 'First name of the employee' },
      employeeCode: { type: 'string', path: 'employee.employeeCode' },
      department: { type: 'string', path: 'employee.department.name' },
      designation: { type: 'string', path: 'employee.designation', describe: 'Job title' },
    },
    metrics: {
      overtimeMinutes: {
        agg: 'sum',
        needs: ['checkIn', 'checkOut'],
        // Overtime is never stored. Deriving it here is the same function
        // payroll uses, so the assistant and the payslip cannot disagree.
        compute: (row: Row, ctx: ComputeContext) => overtimeMinutes(workedOn(row), ctx.policy),
        describe: 'Minutes worked beyond the standard day, summed',
      },
      minutesWorked: {
        agg: 'sum',
        needs: ['checkIn', 'checkOut'],
        compute: workedOn,
        describe: 'Total minutes worked',
      },
      averageMinutesWorked: {
        agg: 'avg',
        needs: ['checkIn', 'checkOut'],
        compute: workedOn,
        describe: 'Average minutes worked on days that were completed',
      },
    },
    defaultOrder: { field: 'date', direction: 'desc' },
  }),

  // ─── Leave ────────────────────────────────────────────────────────

  leaveRequest: defineEntity({
    model: 'leaveRequest',
    describe: 'A request for leave, with its dates, length and current status.',
    access: {
      roles: EVERYONE,
      seesEveryone: HR_UP,
      ownedVia: 'employeeId',
    },
    fields: {
      status: { type: 'enum', values: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] },
      startDate: { type: 'date' },
      endDate: { type: 'date' },
      days: { type: 'number', describe: 'Working days requested' },
      createdAt: { type: 'date', describe: 'When the request was submitted' },
      leaveType: { type: 'string', path: 'leaveType.name' },
      paid: { type: 'boolean', path: 'leaveType.isPaid' },
      employeeName: { type: 'string', path: 'employee.firstName' },
      employeeCode: { type: 'string', path: 'employee.employeeCode' },
      department: { type: 'string', path: 'employee.department.name' },
      designation: { type: 'string', path: 'employee.designation' },
      // Deliberately absent: `reason` and `reviewNote`. Why somebody asked
      // for leave is between them and their approver, and an aggregate
      // query is never the right way to read it.
    },
    metrics: {
      totalDays: { agg: 'sum', field: 'days', describe: 'Total days requested' },
      averageDays: { agg: 'avg', field: 'days', describe: 'Average length of a request' },
      longestRequest: { agg: 'max', field: 'days', describe: 'Longest single request' },
    },
    defaultOrder: { field: 'startDate', direction: 'desc' },
  }),

  leaveBalance: defineEntity({
    model: 'leaveBalance',
    describe: 'Leave entitlement for one employee, one leave type, one year: allocated and used.',
    access: {
      roles: EVERYONE,
      seesEveryone: HR_UP,
      ownedVia: 'employeeId',
    },
    fields: {
      year: { type: 'number', groupable: true },
      allocated: { type: 'number' },
      used: { type: 'number' },
      leaveType: { type: 'string', path: 'leaveType.name' },
      employeeName: { type: 'string', path: 'employee.firstName' },
      employeeCode: { type: 'string', path: 'employee.employeeCode' },
      department: { type: 'string', path: 'employee.department.name' },
    },
    metrics: {
      totalAllocated: { agg: 'sum', field: 'allocated', describe: 'Days allocated' },
      totalUsed: { agg: 'sum', field: 'used', describe: 'Days used' },
      totalRemaining: {
        agg: 'sum',
        needs: ['allocated', 'used'],
        compute: (row: Row) => (num(row.allocated) ?? 0) - (num(row.used) ?? 0),
        describe: 'Days still available',
      },
      averageUsed: { agg: 'avg', field: 'used', describe: 'Average days used' },
    },
  }),

  leaveType: defineEntity({
    model: 'leaveType',
    describe: 'Company leave policy: the leave types that exist, their annual quota and whether they are paid.',
    access: { roles: EVERYONE, seesEveryone: EVERYONE, shared: true },
    fields: {
      name: { type: 'string' },
      annualQuota: { type: 'number', describe: 'Days per year; 0 means unlimited but unpaid' },
      isPaid: { type: 'boolean' },
    },
    metrics: {},
    defaultOrder: { field: 'name', direction: 'asc' },
  }),

  // ─── People ───────────────────────────────────────────────────────

  employee: defineEntity({
    model: 'employee',
    describe: 'A person on the payroll: their department, job title, joining date and employment status.',
    access: {
      roles: EVERYONE,
      seesEveryone: HR_UP,
      // An employee querying this entity sees exactly one row: their own.
      ownedVia: 'id',
    },
    fields: {
      employeeCode: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string', restrictedTo: HR_UP },
      designation: { type: 'string', describe: 'Job title' },
      department: { type: 'string', path: 'department.name' },
      joiningDate: { type: 'date' },
      employmentStatus: {
        type: 'enum',
        values: ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'],
      },
      // Pay is HR-only even on your own row. Employees read their own pay
      // from a payslip, which is the issued figure rather than the current
      // contract value.
      baseSalary: { type: 'number', restrictedTo: HR_UP },
      allowances: { type: 'number', restrictedTo: HR_UP },
    },
    metrics: {
      totalBaseSalary: {
        agg: 'sum', field: 'baseSalary', restrictedTo: HR_UP,
        describe: 'Combined monthly base salary',
      },
      averageBaseSalary: {
        agg: 'avg', field: 'baseSalary', restrictedTo: HR_UP,
        describe: 'Average monthly base salary',
      },
      averageTenureMonths: {
        agg: 'avg',
        needs: ['joiningDate'],
        compute: (row: Row) => {
          const joined = asDate(row.joiningDate);
          if (!joined) return null;
          return Math.floor((Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
        },
        describe: 'Average length of service in months',
      },
    },
    defaultOrder: { field: 'firstName', direction: 'asc' },
  }),

  department: defineEntity({
    model: 'department',
    describe: 'The list of departments.',
    access: { roles: EVERYONE, seesEveryone: EVERYONE, shared: true },
    fields: { name: { type: 'string' } },
    metrics: {},
    defaultOrder: { field: 'name', direction: 'asc' },
  }),

  // ─── Money ────────────────────────────────────────────────────────

  payslip: defineEntity({
    model: 'payslip',
    describe: 'An issued payslip. Every figure was frozen when the payroll run was finalised.',
    access: {
      roles: EVERYONE,
      seesEveryone: HR_UP,
      ownedVia: 'employeeId',
    },
    fields: {
      year: { type: 'number', path: 'payrollRun.year', groupable: true },
      month: { type: 'number', path: 'payrollRun.month', groupable: true },
      runStatus: { type: 'enum', path: 'payrollRun.status', values: ['DRAFT', 'FINALISED'] },
      baseSalary: { type: 'number' },
      allowances: { type: 'number' },
      overtimeAmount: { type: 'number' },
      bonus: { type: 'number' },
      unpaidLeaveDeduction: { type: 'number' },
      otherDeductions: { type: 'number' },
      duesDeduction: { type: 'number', describe: 'Loan or advance recovered this month' },
      netSalary: { type: 'number', describe: 'Take-home pay' },
      employeeName: { type: 'string', path: 'employee.firstName' },
      employeeCode: { type: 'string', path: 'employee.employeeCode' },
      department: { type: 'string', path: 'employee.department.name' },
      designation: { type: 'string', path: 'employee.designation' },
    },
    metrics: {
      totalNet: { agg: 'sum', field: 'netSalary', describe: 'Total take-home pay' },
      averageNet: { agg: 'avg', field: 'netSalary', describe: 'Average take-home pay' },
      totalOvertime: { agg: 'sum', field: 'overtimeAmount', describe: 'Total paid as overtime' },
      totalBonus: { agg: 'sum', field: 'bonus', describe: 'Total paid as bonus' },
      totalDeductions: {
        agg: 'sum',
        needs: ['unpaidLeaveDeduction', 'otherDeductions', 'duesDeduction'],
        compute: (row: Row) =>
          (num(row.unpaidLeaveDeduction) ?? 0) +
          (num(row.otherDeductions) ?? 0) +
          (num(row.duesDeduction) ?? 0),
        describe: 'Everything withheld: unpaid leave, other deductions and dues',
      },
    },
    defaultOrder: { field: 'year', direction: 'desc' },
  }),

  payrollRun: defineEntity({
    model: 'payrollRun',
    describe: 'A monthly payroll run and whether it is still a draft or finalised.',
    // No ownership path: a run belongs to the company, not a person. It is
    // therefore HR-only — `shared` is not set, so a restricted role is
    // refused rather than quietly shown everything.
    access: { roles: HR_UP, seesEveryone: HR_UP },
    fields: {
      year: { type: 'number', groupable: true },
      month: { type: 'number', groupable: true },
      status: { type: 'enum', values: ['DRAFT', 'FINALISED'] },
      processedAt: { type: 'date' },
    },
    metrics: {},
    defaultOrder: { field: 'year', direction: 'desc' },
  }),

  due: defineEntity({
    model: 'due',
    describe: 'A loan, advance or other amount an employee owes the company.',
    access: {
      roles: EVERYONE,
      seesEveryone: HR_UP,
      ownedVia: 'employeeId',
    },
    fields: {
      type: { type: 'enum', values: ['LOAN', 'ADVANCE', 'EQUIPMENT', 'OTHER'] },
      status: { type: 'enum', values: ['ACTIVE', 'CLEARED', 'WAIVED'] },
      description: { type: 'string' },
      principalAmount: { type: 'number' },
      monthlyInstallment: { type: 'number' },
      issuedOn: { type: 'date' },
      employeeName: { type: 'string', path: 'employee.firstName' },
      employeeCode: { type: 'string', path: 'employee.employeeCode' },
      department: { type: 'string', path: 'employee.department.name' },
    },
    metrics: {
      totalPrincipal: { agg: 'sum', field: 'principalAmount', describe: 'Total originally advanced' },
      totalRemaining: {
        agg: 'sum',
        needs: ['principalAmount', 'payments.amount'],
        // Remaining is never stored — it is principal minus what has been
        // recovered so far, exactly as the dues service computes it.
        compute: (row: Row) => {
          const payments = Array.isArray(row.payments) ? row.payments : [];
          const paid = payments.reduce<number>(
            (sum, p) => sum + (num((p as Row).amount) ?? 0),
            0,
          );
          return (num(row.principalAmount) ?? 0) - paid;
        },
        describe: 'Principal still outstanding',
      },
      totalMonthlyInstallment: {
        agg: 'sum', field: 'monthlyInstallment',
        describe: 'Combined monthly recovery',
      },
    },
    defaultOrder: { field: 'issuedOn', direction: 'desc' },
  }),

  // ─── Calendar ─────────────────────────────────────────────────────

  holiday: defineEntity({
    model: 'holiday',
    describe: 'A company holiday. These days are not working days.',
    access: { roles: EVERYONE, seesEveryone: EVERYONE, shared: true },
    fields: {
      date: { type: 'date' },
      name: { type: 'string' },
    },
    metrics: {},
    defaultOrder: { field: 'date', direction: 'asc' },
  }),
};
