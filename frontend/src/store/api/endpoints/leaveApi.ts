import { baseApi } from '../baseApi';
import type { LeaveBalance, LeaveRequest, LeaveType, Paginated } from '@/types';

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
        { type: 'Attendance', id: 'MY_LIST' },
        { type: 'Notification', id: 'COUNT' },
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
