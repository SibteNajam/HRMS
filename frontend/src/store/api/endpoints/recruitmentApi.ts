import { baseApi } from '../baseApi';

export type JobPostingStatus = 'DRAFT' | 'OPEN' | 'CLOSED';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
export type WorkMode = 'ON_SITE' | 'HYBRID' | 'REMOTE';

export type ApplicationStatus =
  | 'RECEIVED' | 'SCREENED' | 'SHORTLISTED' | 'INTERVIEW'
  | 'REJECTED' | 'HIRED' | 'NEEDS_REVIEW';

export interface JobPosting {
  id: number;
  code: string;
  title: string;
  description: string;
  requiredSkills: string[];
  minYearsExperience: number;
  /** Score at or above which a candidate is invited automatically. */
  shortlistThreshold: number;
  status: JobPostingStatus;
  department: { id: number; name: string } | null;
  openedAt: string | null;
  closedAt: string | null;
  _count?: { applications: number; slots: number };

  /**
   * Advert fields. Never scored against — they exist so the advert can be
   * generated from the posting rather than written again elsewhere.
   */
  location: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  salaryRange: string | null;
  advertIntro: string | null;

  /**
   * The interview window, set once when the role is created. Every
   * bookable slot is generated from it, so HR never picks times one by
   * one and every candidate sees the same grid.
   */
  interviewFrom: string | null;
  interviewTo: string | null;
  interviewStartHour: number;
  interviewEndHour: number;
  breakStartHour: number | null;
  breakEndHour: number | null;
  slotMinutes: number;
}

/** What rebuilding a posting's slots did. */
export interface SlotRebuild {
  generated: number;
  /** Already booked, so left exactly where they were. */
  kept: number;
  removed: number;
  window: string | null;
}

/** Generated from the posting, every time it is read. */
export interface Advert {
  text: string;
  /** What shows before a feed's "see more" fold. */
  preview: string;
  characters: number;
}

export interface InterviewSlot {
  id: number;
  startsAt: string;
  endsAt: string;
  interview?: { id: number; applicationId: number } | null;
}

export interface Application {
  id: number;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  source: 'EMAIL' | 'FORM' | 'MANUAL';
  status: ApplicationStatus;
  cvFileName: string | null;
  /** 0–100 against the posting. Null until screened. */
  score: number | null;
  scoreReason: string | null;
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
  /** What the CV evidences, found by the scorer. */
  yearsExperience: string | null;
  scoredAt: string | null;

  /** Typed by the candidate on the careers form. Null for an emailed CV. */
  candidateAddress: string | null;
  statedYearsExperience: string | null;
  currentSalary: string | null;
  expectedSalary: string | null;
  /** Why it was parked, or the reason a person gave for their decision. */
  decisionNote: string | null;
  bookingToken: string;
  receivedAt: string;
  posting: { id: number; code: string; title: string; shortlistThreshold: number } | null;
  interview: {
    id: number;
    slot: { startsAt: string; endsAt: string };
    meetingLink: string | null;
  } | null;
}

export interface InterviewRow {
  id: number;
  slot: { startsAt: string; endsAt: string };
  meetingLink: string | null;
  application: {
    id: number;
    candidateName: string;
    candidateEmail: string;
    score: number | null;
    posting: { id: number; code: string; title: string } | null;
  };
}

export interface UpsertPostingArgs {
  id?: number;
  code: string;
  title: string;
  description: string;
  requiredSkills: string[];
  minYearsExperience?: number;
  shortlistThreshold?: number;
  departmentId?: number;
  status?: JobPostingStatus;
  interviewFrom?: string;
  interviewTo?: string;
  interviewStartHour?: number;
  interviewEndHour?: number;
  breakStartHour?: number;
  breakEndHour?: number;
  slotMinutes?: number;
  location?: string;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  salaryRange?: string;
  advertIntro?: string;
}

export const recruitmentApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRecruitmentStatus: build.query<{ inbox: boolean }, void>({
      query: () => '/recruitment/status',
    }),

    getPostings: build.query<JobPosting[], void>({
      query: () => '/recruitment/postings',
      providesTags: ['JobPosting'],
    }),

    getPosting: build.query<
      JobPosting & { slots: InterviewSlot[]; advert: Advert },
      number
    >({
      query: (id) => `/recruitment/postings/${id}`,
      providesTags: (r, e, id) => [{ type: 'JobPosting', id }],
    }),

    /** The shortlist: scored, best first, cheaper first on a tie. */
    getTopApplications: build.query<Application[], number | void>({
      query: (limit) => ({ url: '/recruitment/applications/top', params: { limit: limit ?? 15 } }),
      providesTags: ['Application'],
    }),

    createPosting: build.mutation<JobPosting & { slots: SlotRebuild }, UpsertPostingArgs>({
      query: (body) => ({ url: '/recruitment/postings', method: 'POST', body }),
      invalidatesTags: ['JobPosting'],
    }),

    updatePosting: build.mutation<JobPosting & { slots: SlotRebuild }, UpsertPostingArgs>({
      query: ({ id, ...body }) => ({
        url: `/recruitment/postings/${id}`, method: 'PATCH', body,
      }),
      invalidatesTags: ['JobPosting'],
    }),

    getApplications: build.query<Application[], void>({
      query: () => '/recruitment/applications',
      providesTags: ['Application'],
    }),

    /**
     * Uploading a CV runs the whole pipeline — parse, score, and email the
     * candidate if they clear the bar — so the interview list is stale too.
     */
    uploadCv: build.mutation<Application, { postingId: number; file: File }>({
      query: ({ postingId, file }) => {
        const form = new FormData();
        form.append('cv', file);
        return {
          url: `/recruitment/postings/${postingId}/applications`,
          method: 'POST',
          body: form,
        };
      },
      invalidatesTags: ['Application', 'Interview'],
    }),

    screenApplication: build.mutation<Application, number>({
      query: (id) => ({ url: `/recruitment/applications/${id}/screen`, method: 'POST' }),
      invalidatesTags: ['Application'],
    }),

    assignPosting: build.mutation<Application, { id: number; jobPostingId: number }>({
      query: ({ id, jobPostingId }) => ({
        url: `/recruitment/applications/${id}/posting`,
        method: 'PATCH',
        body: { jobPostingId },
      }),
      invalidatesTags: ['Application'],
    }),

    decideApplication: build.mutation<
      Application,
      { id: number; decision: 'REJECTED' | 'HIRED' | 'SHORTLISTED'; note: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/recruitment/applications/${id}/decide`, method: 'POST', body,
      }),
      invalidatesTags: ['Application', 'Interview'],
    }),

    addSlots: build.mutation<
      { added: number; skipped: number },
      { postingId: number; slots: string[]; durationMinutes?: number }
    >({
      query: ({ postingId, ...body }) => ({
        url: `/recruitment/postings/${postingId}/slots`, method: 'POST', body,
      }),
      invalidatesTags: ['JobPosting'],
    }),

    removeSlot: build.mutation<{ message: string }, number>({
      query: (id) => ({ url: `/recruitment/slots/${id}`, method: 'DELETE' }),
      invalidatesTags: ['JobPosting'],
    }),

    getInterviews: build.query<InterviewRow[], void>({
      query: () => '/recruitment/interviews',
      providesTags: ['Interview'],
    }),

    /** Attach joining details. The candidate is emailed them. */
    setMeetingLink: build.mutation<
      unknown, { id: number; meetingLink: string; note?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/recruitment/interviews/${id}/link`, method: 'PATCH', body,
      }),
      invalidatesTags: ['Interview', 'Application'],
    }),

    cancelInterview: build.mutation<{ message: string }, { id: number; note: string }>({
      query: ({ id, note }) => ({
        url: `/recruitment/interviews/${id}/cancel`,
        method: 'POST',
        body: { decision: 'SHORTLISTED', note },
      }),
      invalidatesTags: ['Interview', 'Application', 'JobPosting'],
    }),

    checkInbox: build.mutation<
      { read: number; applications: number; ignored: number }, void
    >({
      query: () => ({ url: '/recruitment/inbox/check', method: 'POST' }),
      invalidatesTags: ['Application'],
    }),
  }),
});

export const {
  useGetRecruitmentStatusQuery,
  useGetPostingsQuery,
  useGetPostingQuery,
  useCreatePostingMutation,
  useUpdatePostingMutation,
  useGetApplicationsQuery,
  useGetTopApplicationsQuery,
  useUploadCvMutation,
  useScreenApplicationMutation,
  useAssignPostingMutation,
  useDecideApplicationMutation,
  useAddSlotsMutation,
  useRemoveSlotMutation,
  useGetInterviewsQuery,
  useSetMeetingLinkMutation,
  useCancelInterviewMutation,
  useCheckInboxMutation,
} = recruitmentApi;
