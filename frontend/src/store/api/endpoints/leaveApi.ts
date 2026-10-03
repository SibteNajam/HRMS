import { baseApi } from '../baseApi';
import type {
  Department, LeaveBalance, LeaveRequest, LeaveType, Paginated, Role,
} from '@/types';

export interface EmployeeBalances {
  employee: {
    id: number; employeeCode: string; firstName: string; lastName: string;
    designation: string; department: Department; role: Role;
  };
  balances: LeaveBalance[];
}

export interface CalendarSpan {
  id: number;
  startDate: string;
  endDate: string;
  days: number;
  leaveType: { id: number; name: string };
}

export interface CalendarRow {
  employee: {
    id: number; firstName: string; lastName: string; employeeCode: string;
    department: Department;
  };
  spans: CalendarSpan[];
}

export interface CalendarData {
  year: number;
  month: number;
  daysInMonth: number;
  rows: CalendarRow[];
  /** Other months within ±6 that do have approved leave. */
  monthsWithLeave: { year: number; month: number; count: number }[];
}

export interface UpsertLeaveTypeArgs {
  id?: number;
  name: string;
  annualQuota: number;
  isPaid: boolean;
}

export interface CreateLeaveArgs {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ReviewArgs {
  id: number;
  decision: 'APPROVED' | 'REJECTED';
  note?: string;
  /** Sent so the audit trail shows whether HR followed or overrode the AI. */
  aiVerdict?: 'APPROVE' | 'REVIEW' | 'REJECT';
}

export interface LeaveRecommendation {
  requestId: number;
  verdict: 'APPROVE' | 'REVIEW' | 'REJECT';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  basis: string[];
  /**
   * Present when the rules engine overrode the assistant — a blocking rule
   * forcing a rejection, or a concern raising an approval to a review.
   */
  adjusted?: string;
}

export interface ListArgs {
  page?: number;
  limit?: number;
  status?: LeaveRequest['status'];
  leaveTypeId?: number;
  departmentId?: number;
}

export const leaveApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getLeaveTypes: build.query<LeaveType[], void>({
      query: () => '/leave/types',
      providesTags: ['LeaveType'],
    }),

    getMyLeaveBalance: build.query<LeaveBalance[], void>({
      query: () => '/leave/balance/me',
      providesTags: [{ type: 'LeaveBalance', id: 'ME' }],
    }),

    getMyLeaveRequests: build.query<Paginated<LeaveRequest>, ListArgs>({
      query: (params) => ({ url: '/leave/requests/me', params }),
      providesTags: [{ type: 'LeaveRequest', id: 'MY_LIST' }],
    }),

    getPendingLeaveRequests: build.query<Paginated<LeaveRequest>, ListArgs>({
      query: (params) => ({ url: '/leave/requests/pending', params }),
      providesTags: [{ type: 'LeaveRequest', id: 'PENDING' }],
    }),

    getPendingLeaveCount: build.query<{ count: number }, void>({
      query: () => '/leave/requests/pending/count',
      providesTags: [{ type: 'LeaveRequest', id: 'PENDING_COUNT' }],
    }),

    getAllLeaveRequests: build.query<Paginated<LeaveRequest>, ListArgs>({
      query: (params) => ({ url: '/leave/requests/all', params }),
      providesTags: [{ type: 'LeaveRequest', id: 'ALL' }],
    }),

    getLeaveRecommendations: build.mutation<LeaveRecommendation[], void>({
      query: () => ({ url: '/leave/requests/recommendations', method: 'POST' }),
    }),

    createLeaveRequest: build.mutation<LeaveRequest, CreateLeaveArgs>({
      query: (body) => ({ url: '/leave/requests', method: 'POST', body }),
      invalidatesTags: [
        { type: 'LeaveRequest', id: 'MY_LIST' },
        { type: 'LeaveRequest', id: 'PENDING' },
        { type: 'LeaveRequest', id: 'PENDING_COUNT' },
        { type: 'LeaveRequest', id: 'ALL' },
      ],
    }),

    reviewLeaveRequest: build.mutation<LeaveRequest, ReviewArgs>({
      query: ({ id, ...body }) => ({
        url: `/leave/requests/${id}/review`, method: 'PATCH', body,
      }),
      // Approval consumes balance AND writes ON_LEAVE attendance rows, so
      // both of those caches are stale too. Missing these is what makes one
      // screen show correct data while another shows stale.
      invalidatesTags: [
        { type: 'LeaveRequest', id: 'PENDING' },
        { type: 'LeaveRequest', id: 'PENDING_COUNT' },
        { type: 'LeaveRequest', id: 'MY_LIST' },
        { type: 'LeaveRequest', id: 'ALL' },
        { type: 'LeaveBalance', id: 'ME' },
        { type: 'LeaveBalance', id: 'ALL' },
        { type: 'LeaveRequest', id: 'CALENDAR' },
        { type: 'Attendance', id: 'MY_LIST' },
        { type: 'Notification', id: 'COUNT' },
      ],
    }),

    getAllBalances: build.query<
      EmployeeBalances[],
      { year?: number; departmentId?: number; search?: string }
    >({
      query: (params) => ({ url: '/leave/balances', params }),
      providesTags: [{ type: 'LeaveBalance', id: 'ALL' }],
    }),

    getLeaveCalendar: build.query<
      CalendarData,
      { year: number; month: number; departmentId?: number }
    >({
      query: (params) => ({ url: '/leave/calendar', params }),
      providesTags: [{ type: 'LeaveRequest', id: 'CALENDAR' }],
    }),

    upsertLeaveType: build.mutation<LeaveType, UpsertLeaveTypeArgs>({
      query: ({ id, ...body }) =>
        id
          ? { url: `/leave/types/${id}`, method: 'PATCH', body }
          : { url: '/leave/types', method: 'POST', body },
      invalidatesTags: [
        'LeaveType',
        { type: 'LeaveBalance', id: 'ME' },
        { type: 'LeaveBalance', id: 'ALL' },
      ],
    }),

    cancelLeaveRequest: build.mutation<LeaveRequest, number>({
      query: (id) => ({ url: `/leave/requests/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: [
        { type: 'LeaveRequest', id: 'MY_LIST' },
        { type: 'LeaveRequest', id: 'PENDING' },
        { type: 'LeaveRequest', id: 'PENDING_COUNT' },
      ],
    }),
  }),
});

export const {
  useGetLeaveRecommendationsMutation,
  useGetAllBalancesQuery,
  useGetLeaveCalendarQuery,
  useUpsertLeaveTypeMutation,
  useGetLeaveTypesQuery,
  useGetMyLeaveBalanceQuery,
  useGetMyLeaveRequestsQuery,
  useGetPendingLeaveRequestsQuery,
  useGetPendingLeaveCountQuery,
  useGetAllLeaveRequestsQuery,
  useCreateLeaveRequestMutation,
  useReviewLeaveRequestMutation,
  useCancelLeaveRequestMutation,
} = leaveApi;
