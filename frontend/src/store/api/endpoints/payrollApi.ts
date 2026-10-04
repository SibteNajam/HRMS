import { baseApi } from '../baseApi';
import type { Department } from '@/types';

export type PayrollRunStatus = 'DRAFT' | 'FINALISED';

export interface PayrollFlag {
  code: string;
  level: 'info' | 'warning' | 'danger';
  label: string;
  detail: string;
}

export interface PayslipFigures {
  baseSalary: number;
  allowances: number;
  overtimeAmount: number;
  bonus: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  duesDeduction: number;
  netSalary: number;
  gross: number;
  totalDeductions: number;

  /**
   * Why the unpaid-leave figure is what it is — the days, the dates and the
   * per-day rate. Computed from approved leave when the run was created and
   * frozen with the payslip. Null when there was no unpaid leave.
   */
  leaveDeductionNote: string | null;
  /** HR's own words for the two figures only HR can set. */
  bonusReason: string | null;
  otherDeductionsReason: string | null;
}

export interface RunPayslip extends PayslipFigures {
  id: number;
  employeeId: number;
  employee: {
    id: number; employeeCode: string; firstName: string; lastName: string;
    designation: string; joiningDate: string; department: { name: string };
  };
  /** Present only when the employee joined partway through the month. */
  proRata: {
    joined: string;
    payableDays: number;
    workingDaysInMonth: number;
    fullBaseSalary: number;
  } | null;
  flags: PayrollFlag[];
}

export interface PayrollRun {
  id: number;
  month: number;
  year: number;
  status: PayrollRunStatus;
  processedAt: string | null;
  createdAt: string;
  _count?: { payslips: number };
  processor?: {
    email: string;
    employee: { firstName: string; lastName: string } | null;
  } | null;
}

export interface RunDetail extends PayrollRun {
  payslips: RunPayslip[];
  totals: {
    gross: number; deductions: number; net: number;
    overtime: number; duesRecovered: number;
  };
  flaggedCount: number;
  /**
   * Set when records behind this draft changed after it was calculated.
   * A payslip is a snapshot and nothing recomputes it, so the figures here
   * are out of date until the draft is created again. Null on a finalised
   * run — by then the correct place for a late item is the next month.
   */
  staleness: {
    leaveApproved: number;
    attendanceAdded: number;
    message: string;
  } | null;
  /**
   * False while the month is still running. The figures are a forecast
   * then — overtime and unpaid leave are still accumulating — and the run
   * cannot be finalised.
   */
  monthComplete: boolean;
  /** YYYY-MM-DD: the first day this month can be finalised. */
  opensOn: string;
}

export interface MyPayslip extends PayslipFigures {
  id: number;
  payrollRun: { month: number; year: number; processedAt: string | null };
  employee: {
    employeeCode: string; firstName: string; lastName: string; email: string;
    designation: string; joiningDate: string; baseSalary: number;
    department: { name: string };
  };
  period: {
    periodStart: string;
    periodEnd: string;
    workingDays: number;
    paidDays: number;
  };
}

export interface SalaryRow {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation: string;
  baseSalary: number;
  allowances: number;
  monthlyCost: number;
  department: { name: string };
}

export interface Comparison {
  current: PayslipFigures;
  previous: PayslipFigures | null;
  differences: { field: string; from: number; to: number; change: number }[];
}

export const payrollApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMyPayslips: build.query<MyPayslip[], void>({
      query: () => '/payroll/payslips/me',
      providesTags: [{ type: 'Payslip', id: 'MY_LIST' }],
    }),

    getPayslip: build.query<RunPayslip & { payrollRun: PayrollRun }, number>({
      query: (id) => `/payroll/payslips/${id}`,
      providesTags: (r, e, id) => [{ type: 'Payslip', id }],
    }),

    comparePayslip: build.query<Comparison, { month: number; year: number }>({
      query: (params) => ({ url: '/payroll/payslips/me/compare', params }),
    }),

    explainPayslip: build.mutation<{ explanation: string }, number>({
      query: (id) => ({ url: `/payroll/payslips/${id}/explain`, method: 'POST' }),
    }),

    getRuns: build.query<PayrollRun[], void>({
      query: () => '/payroll/runs',
      providesTags: [{ type: 'PayrollRun', id: 'LIST' }],
    }),

    getRun: build.query<RunDetail, number>({
      query: (id) => `/payroll/runs/${id}`,
      providesTags: (r, e, id) => [{ type: 'PayrollRun', id }],
    }),

    createRun: build.mutation<RunDetail, { month: number; year: number }>({
      query: (body) => ({ url: '/payroll/runs', method: 'POST', body }),
      invalidatesTags: [{ type: 'PayrollRun', id: 'LIST' }],
    }),

    adjustPayslip: build.mutation<
      PayslipFigures,
      {
        runId: number;
        payslipId: number;
        bonus?: number;
        otherDeductions?: number;
        /** Required by the server whenever the matching figure is above zero. */
        bonusReason?: string;
        otherDeductionsReason?: string;
      }
    >({
      query: ({ runId, payslipId, ...body }) => ({
        url: `/payroll/runs/${runId}/payslips/${payslipId}`, method: 'PATCH', body,
      }),
      invalidatesTags: (r, e, { runId }) => [{ type: 'PayrollRun', id: runId }],
    }),

    /** Refreshes derived figures. HR's bonuses and deductions are kept. */
    recalculateRun: build.mutation<RunDetail, number>({
      query: (id) => ({ url: `/payroll/runs/${id}/recalculate`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'PayrollRun', id }],
    }),

    finaliseRun: build.mutation<RunDetail, number>({
      query: (id) => ({ url: `/payroll/runs/${id}/finalise`, method: 'POST' }),
      // Finalising issues payslips and recovers dues, so both are stale.
      invalidatesTags: (r, e, id) => [
        { type: 'PayrollRun', id },
        { type: 'PayrollRun', id: 'LIST' },
        { type: 'Payslip', id: 'MY_LIST' },
        { type: 'Due', id: 'LIST' },
        { type: 'Due', id: 'MY_LIST' },
        { type: 'Notification', id: 'COUNT' },
      ],
    }),

    deleteRun: build.mutation<{ message: string }, number>({
      query: (id) => ({ url: `/payroll/runs/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'PayrollRun', id: 'LIST' }],
    }),

    getSalaryStructure: build.query<SalaryRow[], void>({
      query: () => '/payroll/structure',
      providesTags: [{ type: 'Employee', id: 'SALARY' }],
    }),

    updateSalary: build.mutation<
      SalaryRow,
      { employeeId: number; baseSalary: number; allowances: number; reason: string }
    >({
      query: ({ employeeId, ...body }) => ({
        url: `/payroll/structure/${employeeId}`, method: 'PATCH', body,
      }),
      invalidatesTags: [{ type: 'Employee', id: 'SALARY' }],
    }),
  }),
});

export const {
  useGetMyPayslipsQuery, useGetPayslipQuery, useComparePayslipQuery,
  useExplainPayslipMutation,
  useGetRunsQuery, useGetRunQuery, useCreateRunMutation,
  useAdjustPayslipMutation, useRecalculateRunMutation,
  useFinaliseRunMutation, useDeleteRunMutation,
  useGetSalaryStructureQuery, useUpdateSalaryMutation,
} = payrollApi;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthLabel = (month: number, year: number) =>
  `${MONTHS[month - 1]} ${year}`;
