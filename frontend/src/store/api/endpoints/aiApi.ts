import { baseApi } from '../baseApi';

export interface AiMessage {
  id: number;
  role: 'USER' | 'ASSISTANT';
  content: string;
  toolsUsed: string[] | null;
  createdAt: string;
}

export interface AiConversation {
  id: number;
  title: string;
  createdAt: string;
}

export interface ConversationDetail extends AiConversation {
  messages: AiMessage[];
}

export interface ChatResponse {
  conversationId: number;
  reply: string;
  toolsUsed: string[];
}

export const aiApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAiStatus: build.query<{ enabled: boolean }, void>({
      query: () => '/ai/status',
    }),

    getConversations: build.query<AiConversation[], void>({
      query: () => '/ai/conversations',
      providesTags: [{ type: 'AiConversation', id: 'LIST' }],
    }),

    getConversation: build.query<ConversationDetail, number>({
      query: (id) => `/ai/conversations/${id}`,
      providesTags: (r, e, id) => [{ type: 'AiConversation', id }],
    }),

    sendChat: build.mutation<
      ChatResponse,
      { message: string; conversationId?: number }
    >({
      query: (body) => ({ url: '/ai/chat', method: 'POST', body }),
      invalidatesTags: (r) =>
        r
          ? [
              { type: 'AiConversation' as const, id: r.conversationId },
              { type: 'AiConversation' as const, id: 'LIST' },
            ]
          : [],
    }),

    deleteConversation: build.mutation<{ message: string }, number>({
      query: (id) => ({ url: `/ai/conversations/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'AiConversation', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAiStatusQuery,
  useGetConversationsQuery,
  useGetConversationQuery,
  useSendChatMutation,
  useDeleteConversationMutation,
} = aiApi;

/** Matches the labels the backend uses for the "working" line. */
export const TOOL_LABELS: Record<string, string> = {
  get_my_leave_balance: 'Checking your leave balance',
  get_my_leave_requests: 'Looking up your leave requests',
  get_my_attendance: 'Reading your attendance',
  get_my_attendance_summary: 'Summarising your attendance',
  get_my_dues: 'Checking your dues',
  get_my_payslips: 'Reading your payslips',
  search_employees: 'Searching employees',
  get_attendance_overview: 'Reviewing attendance across the team',
  get_daily_register: 'Reading the daily register',
  get_pending_leave_requests: 'Checking pending leave requests',
  get_leave_balances_overview: 'Reading leave balances',
  get_outstanding_dues: 'Checking outstanding dues',
};
