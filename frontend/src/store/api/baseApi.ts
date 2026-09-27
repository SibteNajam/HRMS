import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  // The session lives in an httpOnly cookie, so there is no token to attach.
  // 'include' is what makes the browser send it cross-origin.
  credentials: 'include',
});

/**
 * On a 401 the session is gone. Clear local auth state and bounce to login
 * rather than leaving the user staring at a screen of failed requests.
 */
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const { clearSession } = await import('../slices/authSlice');
    api.dispatch(clearSession());
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  // Covers a large share of real usage: HR tabs away to read an email, comes
  // back, and the list is current.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  tagTypes: [
    'Session',
    'AdminUser',
    'Employee',
    'Department',
    'Attendance',
    'AttendanceSummary',
    'LeaveRequest',
    'LeaveBalance',
    'LeaveType',
    'PayrollRun',
    'Payslip',
    'Due',
    'Notification',
    'Report',
    'AiConversation',
    'Candidate',
    'JobPosting',
  ],
  endpoints: () => ({}),
});
