import { baseApi } from '../baseApi';
import type { AttendanceStatus, Department } from '@/types';

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  /** Derived server-side, never stored. */
  minutesWorked: number | null;
  overtimeMinutes: number;
}

export interface AttendanceTotals {
  workingDays: number;
  presentDays: number;
  lateCount: number;
  absentDays: number;
  halfDays: number;
  onLeaveDays: number;
  holidayDays: number;
  minutesWorked: number;
  overtimeMinutes: number;
  /** null when there is no history — not the same as 0%. */
  attendancePercentage: number | null;
}

export interface TodayState {
  date: string;
  isWeekend: boolean;
  holiday: { name: string } | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
  record: AttendanceRecord | null;
}

export interface MonthData {
  year: number;
  month: number;
  daysInMonth: number;
  holidays: { date: string; name: string }[];
  weekendDays: number[];
  records: AttendanceRecord[];
  totals: AttendanceTotals;
}

interface RegisterEmployee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation: string;
  department: Department;
}

export interface RegisterData {
  date: string;
  isWeekend: boolean;
  holiday: { name: string } | null;
  counts: Record<string, number>;
  total: number;
  rows: {
    employee: RegisterEmployee;
    record: AttendanceRecord | null;
    status: AttendanceStatus | 'NOT_MARKED';
  }[];
}

export interface SummaryRow {
  employee: RegisterEmployee;
  totals: AttendanceTotals;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export interface CorrectionLog {
  id: number;
  action: string;
  createdAt: string;
  metadata: {
    reason?: string;
    before?: { checkIn: string | null; checkOut: string | null; status: string };
    after?: { checkIn: string | null; checkOut: string | null; status: string };
    status?: string;
    date?: string;
  } | null;
  actor: {
    id: number; email: string;
    employee: { firstName: string; lastName: string } | null;
  } | null;
  record: {
    id: number; date: string;
    employee: { firstName: string; lastName: string; employeeCode: string };
  } | null;
}

export const attendanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getToday: build.query<TodayState, void>({
      query: () => '/attendance/me/today',
      providesTags: [{ type: 'Attendance', id: 'TODAY' }],
    }),

    checkIn: build.mutation<AttendanceRecord, void>({
      query: () => ({ url: '/attendance/check-in', method: 'POST' }),
      invalidatesTags: [
        { type: 'Attendance', id: 'TODAY' },
        { type: 'Attendance', id: 'MY_LIST' },
        { type: 'Attendance', id: 'REGISTER' },
        { type: 'AttendanceSummary', id: 'ME' },
      ],
    }),

    checkOut: build.mutation<AttendanceRecord, void>({
      query: () => ({ url: '/attendance/check-out', method: 'POST' }),
      invalidatesTags: [
        { type: 'Attendance', id: 'TODAY' },
        { type: 'Attendance', id: 'MY_LIST' },
        { type: 'Attendance', id: 'REGISTER' },
        // Check-out is what produces overtime, so the summary is stale too.
        { type: 'AttendanceSummary', id: 'ME' },
      ],
    }),

    getMyMonth: build.query<MonthData, { year?: number; month?: number }>({
      query: (params) => ({ url: '/attendance/me', params }),
      providesTags: [{ type: 'Attendance', id: 'MY_LIST' }],
    }),

    getMySummary: build.query<AttendanceTotals & { windowDays: number }, void>({
      query: () => '/attendance/me/summary',
      providesTags: [{ type: 'AttendanceSummary', id: 'ME' }],
    }),

    getEmployeeMonth: build.query<
      MonthData,
      { employeeId: number; year?: number; month?: number }
    >({
      query: ({ employeeId, ...params }) => ({
        url: `/attendance/employee/${employeeId}`, params,
      }),
      providesTags: [{ type: 'Attendance', id: 'EMPLOYEE_MONTH' }],
    }),

    getRegister: build.query<
      RegisterData,
      { date?: string; departmentId?: number; status?: string; search?: string }
    >({
      query: (params) => ({ url: '/attendance/register', params }),
      providesTags: [{ type: 'Attendance', id: 'REGISTER' }],
    }),

    getAttendanceSummary: build.query<
      SummaryRow[],
      { from?: string; to?: string; departmentId?: number }
    >({
      query: (params) => ({ url: '/attendance/summary', params }),
      providesTags: [{ type: 'AttendanceSummary', id: 'LIST' }],
    }),

    correctAttendance: build.mutation<
      AttendanceRecord,
      { id: number; checkIn?: string; checkOut?: string; status?: string; reason: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/attendance/${id}`, method: 'PATCH', body,
      }),
      invalidatesTags: [
        { type: 'Attendance', id: 'REGISTER' },
        { type: 'Attendance', id: 'MY_LIST' },
        { type: 'Attendance', id: 'EMPLOYEE_MONTH' },
        { type: 'Attendance', id: 'CORRECTIONS' },
        { type: 'AttendanceSummary', id: 'LIST' },
        { type: 'AttendanceSummary', id: 'ME' },
      ],
    }),

    setAttendance: build.mutation<
      AttendanceRecord,
      { employeeId: number; date: string; status: string;
        checkIn?: string; checkOut?: string; reason: string }
    >({
      query: (body) => ({ url: '/attendance/set', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Attendance', id: 'REGISTER' },
        { type: 'Attendance', id: 'EMPLOYEE_MONTH' },
        { type: 'Attendance', id: 'CORRECTIONS' },
        { type: 'AttendanceSummary', id: 'LIST' },
      ],
    }),

    getCorrections: build.query<CorrectionLog[], { limit?: number }>({
      query: (params) => ({ url: '/attendance/corrections/log', params }),
      providesTags: [{ type: 'Attendance', id: 'CORRECTIONS' }],
    }),

    markAbsentees: build.mutation<{ marked: number }, { date?: string }>({
      query: (body) => ({ url: '/attendance/mark-absent', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Attendance', id: 'REGISTER' },
        { type: 'AttendanceSummary', id: 'LIST' },
      ],
    }),

    getHolidays: build.query<Holiday[], { year?: number }>({
      query: (params) => ({ url: '/attendance/holidays/list', params }),
      providesTags: ['Holiday'],
    }),

    createHoliday: build.mutation<Holiday, { date: string; name: string }>({
      query: (body) => ({ url: '/attendance/holidays', method: 'POST', body }),
      invalidatesTags: [
        'Holiday',
        { type: 'Attendance', id: 'REGISTER' },
        { type: 'Attendance', id: 'MY_LIST' },
      ],
    }),

    deleteHoliday: build.mutation<{ message: string }, number>({
      query: (id) => ({ url: `/attendance/holidays/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Holiday', { type: 'Attendance', id: 'MY_LIST' }],
    }),
  }),
});

export const {
  useGetTodayQuery, useCheckInMutation, useCheckOutMutation,
  useGetMyMonthQuery, useGetMySummaryQuery, useGetEmployeeMonthQuery,
  useGetRegisterQuery, useGetAttendanceSummaryQuery,
  useCorrectAttendanceMutation, useSetAttendanceMutation,
  useGetCorrectionsQuery, useMarkAbsenteesMutation,
  useGetHolidaysQuery, useCreateHolidayMutation, useDeleteHolidayMutation,
} = attendanceApi;
