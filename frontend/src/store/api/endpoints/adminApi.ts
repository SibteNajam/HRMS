import { baseApi } from '../baseApi';
import type { Paginated, Role } from '@/types';

export interface AdminUser {
  id: number;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  employee: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    designation: string;
    employmentStatus: string;
    department: { id: number; name: string };
  } | null;
}

export interface UserCounts {
  employees: number;
  hr: number;
  admins: number;
  disabled: number;
}

export interface ListUsersArgs {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
  status?: 'active' | 'disabled';
}

export const adminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminUsers: build.query<Paginated<AdminUser>, ListUsersArgs>({
      query: (params) => ({ url: '/admin/users', params }),
      providesTags: (result) => [
        { type: 'AdminUser' as const, id: 'LIST' },
        ...(result?.data ?? []).map((u) => ({ type: 'AdminUser' as const, id: u.id })),
      ],
    }),

    getUserCounts: build.query<UserCounts, void>({
      query: () => '/admin/users/counts',
      providesTags: [{ type: 'AdminUser', id: 'COUNTS' }],
    }),

    setUserRole: build.mutation<AdminUser, { id: number; role: Role }>({
      query: ({ id, role }) => ({
        url: `/admin/users/${id}/role`, method: 'PATCH', body: { role },
      }),
      invalidatesTags: (r, e, { id }) => [
        { type: 'AdminUser', id },
        { type: 'AdminUser', id: 'LIST' },
        { type: 'AdminUser', id: 'COUNTS' },
      ],
    }),

    setUserStatus: build.mutation<AdminUser, { id: number; isActive: boolean }>({
      query: ({ id, isActive }) => ({
        url: `/admin/users/${id}/status`, method: 'PATCH', body: { isActive },
      }),
      invalidatesTags: (r, e, { id }) => [
        { type: 'AdminUser', id },
        { type: 'AdminUser', id: 'LIST' },
        { type: 'AdminUser', id: 'COUNTS' },
      ],
    }),
  }),
});

export const {
  useGetAdminUsersQuery,
  useGetUserCountsQuery,
  useSetUserRoleMutation,
  useSetUserStatusMutation,
} = adminApi;
