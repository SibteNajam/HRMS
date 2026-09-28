import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { buildSystemPrompt } from './prompts/system-prompt.js';
import { toolsForRole } from './tools/tool-definitions.js';
import { ToolExecutorService } from './tools/tool-executor.service.js';

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** What the UI shows while the model is working. */
const TOOL_LABELS: Record<string, string> = {
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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tools: ToolExecutorService,
  ) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    // The assistant is optional. Every other feature must keep working
    // without it, so a missing key degrades rather than crashes the app.
    this.client = apiKey
      ? new OpenAI({ apiKey, baseURL: this.config.getOrThrow<string>('GROQ_BASE_URL') })
      : null;
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY is not set — the assistant is disabled');
    }
  }

  get enabled() {
    return this.client !== null;
  }

  // ── Conversations ───────────────────────────────────────────────────

  listConversations(userId: number) {
    return this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, createdAt: true },
    });
  }

  async getConversation(user: JwtUser, id: number) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    // Ownership, not just role — a conversation contains the person's own data.
    if (conversation.userId !== user.sub) throw new ForbiddenException();
    return conversation;
  }

  async deleteConversation(user: JwtUser, id: number) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== user.sub) throw new ForbiddenException();
    await this.prisma.aiConversation.delete({ where: { id } });
    return { message: 'Conversation deleted' };
  }

  // ── Chat ────────────────────────────────────────────────────────────

  async chat(user: JwtUser, message: string, conversationId?: number) {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'The assistant is not configured. Ask an administrator to set GROQ_API_KEY.',
      );
    }

    const conversation = conversationId
      ? await this.getConversation(user, conversationId)
      : await this.prisma.aiConversation.create({
          data: {
            userId: user.sub,
            title: message.slice(0, 117) + (message.length > 117 ? '…' : ''),
          },
          include: { messages: true },
        });

    const window = this.config.getOrThrow<number>('AI_HISTORY_WINDOW');
    const history: Message[] = conversation.messages
      .slice(-window)
      .map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }));

    const messages: Message[] = [
      { role: 'system', content: buildSystemPrompt(user) },
      ...history,
      { role: 'user', content: message },
    ];

    const tools = toolsForRole(user.role);
    const toolsUsed: string[] = [];
    const maxTurns = this.config.getOrThrow<number>('AI_MAX_TURNS');

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await this.client.chat.completions.create({
          model: this.config.getOrThrow<string>('AI_MODEL'),
          max_tokens: this.config.getOrThrow<number>('AI_MAX_TOKENS'),
          messages,
          tools,
          tool_choice: 'auto',
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;
        const calls = assistantMessage.tool_calls ?? [];

        if (calls.length === 0) {
          const reply = assistantMessage.content?.trim() ?? '';
          if (!reply) {
            throw new BadRequestException('The assistant returned nothing. Try rephrasing.');
          }
          await this.persist(conversation.id, message, reply, toolsUsed);
          return { conversationId: conversation.id, reply, toolsUsed };
        }

        messages.push(assistantMessage);

        // Results for every call go back before the next request; a missing
        // tool response for an issued call is rejected by the API.
        for (const call of calls) {
          if (call.type !== 'function') continue;
          const name = call.function.name;
          toolsUsed.push(name);

          let content: string;
          try {
            const result = await this.tools.execute(name, call.function.arguments, user);
            content = JSON.stringify(result);
          } catch (err) {
            // Hand the failure to the model so it can explain it, rather
            // than dropping the block and breaking the exchange.
            content = JSON.stringify({
              error: err instanceof Error ? err.message : 'Tool failed',
            });
          }

          messages.push({ role: 'tool', tool_call_id: call.id, content });
        }
      }

      throw new BadRequestException(
        'The assistant could not finish that. Try asking something narrower.',
      );
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ForbiddenException) throw err;
      return this.handleProviderError(err);
    }
  }

  /** Friendly names for the "thinking" line in the UI. */
  static labelFor(tool: string) {
    return TOOL_LABELS[tool] ?? 'Looking that up';
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async persist(
    conversationId: number,
    question: string,
    reply: string,
    toolsUsed: string[],
  ) {
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({
        data: { conversationId, role: 'USER', content: question },
      }),
      this.prisma.aiMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: reply,
          // The audit trail for AI data access: which records were read to
          // produce this answer.
          toolsUsed: toolsUsed.length ? toolsUsed : undefined,
        },
      }),
    ]);
  }

  private handleProviderError(err: unknown): never {
    if (err instanceof OpenAI.APIError) {
      this.logger.error(`Groq ${err.status}: ${err.message}`);
      if (err.status === 401) {
        throw new ServiceUnavailableException('The assistant key is invalid.');
      }
      if (err.status === 429) {
        throw new ServiceUnavailableException(
          'The assistant is rate limited right now. Try again in a moment.',
        );
      }
      throw new ServiceUnavailableException('The assistant is unavailable.');
    }
    this.logger.error('Assistant failed', err as Error);
    throw new ServiceUnavailableException('The assistant is unavailable.');
  }
}
