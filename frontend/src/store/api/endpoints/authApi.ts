import { baseApi } from '../baseApi';
import type { Department, Me, SessionUser } from '@/types';

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  departmentId?: number;
  designation?: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<{ user: SessionUser }, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),

    register: build.mutation<
      { employeeCode: string; email: string },
      RegisterPayload
    >({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),

    /** Public — the signup form needs it before anyone is signed in. */
    getPublicDepartments: build.query<Department[], void>({
      query: () => '/public/departments',
      providesTags: ['Department'],
    }),

    logout: build.mutation<{ message: string }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Session'],
    }),

    getMe: build.query<Me, void>({
      query: () => '/auth/me',
      providesTags: ['Session'],
    }),

    changePassword: build.mutation<
      { message: string },
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useGetPublicDepartmentsQuery,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useChangePasswordMutation,
} = authApi;
