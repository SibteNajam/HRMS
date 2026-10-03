import { baseApi } from '../baseApi';
import type { Project, ProjectStatus } from '@/types';

export interface UpsertProjectArgs {
  id?: number;
  name: string;
  code: string;
  description?: string;
  status?: ProjectStatus;
}

export interface UpsertTeamArgs {
  projectId: number;
  name: string;
  minimumStaff: number;
  departmentId?: number;
}

export interface SetMinimumArgs {
  teamId: number;
  minimumStaff: number;
}

/** The server warns rather than refuses when a minimum exceeds the headcount. */
export interface SetMinimumResult {
  id: number;
  minimumStaff: number;
  size: number;
  warning: string | null;
}

export const projectsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProjects: build.query<Project[], void>({
      query: () => '/projects',
      providesTags: ['Project'],
    }),

    createProject: build.mutation<Project, UpsertProjectArgs>({
      query: (body) => ({ url: '/projects', method: 'POST', body }),
      invalidatesTags: ['Project'],
    }),

    updateProject: build.mutation<Project, UpsertProjectArgs>({
      query: ({ id, ...body }) => ({ url: `/projects/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Project'],
    }),

    deleteProject: build.mutation<{ message: string }, number>({
      query: (id) => ({ url: `/projects/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Project'],
    }),

    addTeam: build.mutation<unknown, UpsertTeamArgs>({
      query: ({ projectId, ...body }) => ({
        url: `/projects/${projectId}/teams`, method: 'POST', body,
      }),
      invalidatesTags: ['Project'],
    }),

    /**
     * Changing a minimum changes which leave goes through without a person,
     * so the approvals queue is invalidated alongside the project list.
     */
    setTeamMinimum: build.mutation<SetMinimumResult, SetMinimumArgs>({
      query: ({ teamId, minimumStaff }) => ({
        url: `/projects/teams/${teamId}/minimum`, method: 'PATCH',
        body: { minimumStaff },
      }),
      invalidatesTags: ['Project', { type: 'LeaveRequest', id: 'PENDING' }],
    }),

    deleteTeam: build.mutation<{ message: string }, number>({
      query: (teamId) => ({ url: `/projects/teams/${teamId}`, method: 'DELETE' }),
      invalidatesTags: ['Project'],
    }),

    addTeamMember: build.mutation<unknown, { teamId: number; employeeId: number; roleOnTeam?: string }>({
      query: ({ teamId, ...body }) => ({
        url: `/projects/teams/${teamId}/members`, method: 'POST', body,
      }),
      invalidatesTags: ['Project', { type: 'LeaveRequest', id: 'PENDING' }],
    }),

    removeTeamMember: build.mutation<{ message: string }, number>({
      query: (memberId) => ({ url: `/projects/members/${memberId}`, method: 'DELETE' }),
      invalidatesTags: ['Project', { type: 'LeaveRequest', id: 'PENDING' }],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useAddTeamMutation,
  useSetTeamMinimumMutation,
  useDeleteTeamMutation,
  useAddTeamMemberMutation,
  useRemoveTeamMemberMutation,
} = projectsApi;
