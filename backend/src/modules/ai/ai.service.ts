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
import { buildSystemPrompt, type ProfileSnapshot } from './prompts/system-prompt.js';
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
  describe_hr_entity: 'Looking at what data is available',
  query_hr_data: 'Querying HR records',
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

  /**
   * @param limit how many of the most recent messages to load.
   *
   * Always bounded. A conversation grows without limit, so loading "all
   * messages" means the query gets slower and heavier every time someone
   * uses it — and the chat path only ever needs the last few.
   */
  async getConversation(user: JwtUser, id: number, limit = 100) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id },
      include: {
        messages: {
          // Newest first so the cap keeps the RECENT messages, then
          // reversed back into reading order.
          orderBy: { createdAt: 'desc' },
          take: limit,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    // Ownership, not just role — a conversation contains the person's own data.
    if (conversation.userId !== user.sub) throw new ForbiddenException();

    return { ...conversation, messages: conversation.messages.reverse() };
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

    const window = this.config.getOrThrow<number>('AI_HISTORY_WINDOW');

    // Load only the window we are going to send. Loading every message to
    // then slice the last ten is work that grows with the conversation and
    // is thrown away.
    const conversation = conversationId
      ? await this.getConversation(user, conversationId, window)
      : await this.prisma.aiConversation.create({
          data: {
            userId: user.sub,
            title: message.slice(0, 117) + (message.length > 117 ? '…' : ''),
          },
          include: { messages: true },
        });

    const history: Message[] = conversation.messages
      .map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }));

    // Identity is loaded server-side and handed to the model, so it never
    // has to ask who it is talking to.
    const profile = await this.profileSnapshot(user);

    const messages: Message[] = [
      { role: 'system', content: buildSystemPrompt(user, profile) },
      ...history,
      { role: 'user', content: message },
    ];

    const tools = toolsForRole(user.role);
    const toolsUsed: string[] = [];
    const maxTurns = this.config.getOrThrow<number>('AI_MAX_TURNS');

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        // On the last turn, take tools away. By then we have the data the
        // model asked for, so the right move is to make it write the answer
        // — not to throw away a completed round-trip and show an error.
        const lastTurn = turn === maxTurns - 1;

        const response = await this.client.chat.completions.create({
          model: this.config.getOrThrow<string>('AI_MODEL'),
          max_tokens: this.config.getOrThrow<number>('AI_MAX_TOKENS'),
          messages,
          ...(lastTurn ? {} : { tools, tool_choice: 'auto' as const }),
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;
        const calls = assistantMessage.tool_calls ?? [];

        if (calls.length === 0 || lastTurn) {
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

      // Unreachable: the final turn always returns above.
      throw new BadRequestException('The assistant could not finish that.');
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ForbiddenException) throw err;
      return this.handleProviderError(err);
    }
  }

  /**
   * Explains a payslip in plain language.
   *
   * The differences are computed by the payroll service and handed over as
   * facts — the model describes them, it never subtracts. That is the whole
   * point of rule 2, and a payslip is where it matters most.
   */
  async explainPayslip(
    user: JwtUser,
    comparison: {
      current: Record<string, number>;
      previous: Record<string, number> | null;
      differences: { field: string; from: number; to: number; change: number }[];
    },
    currency = 'PKR',
  ) {
    if (!this.client) {
      throw new ServiceUnavailableException('The assistant is not configured.');
    }

    const prompt = comparison.previous
      ? `Explain this payslip to the employee who received it, in two or three
sentences of plain English.

These figures are already calculated. Report them exactly; do not add,
subtract or recompute anything.

This month: ${JSON.stringify(comparison.current)}
Last month: ${JSON.stringify(comparison.previous)}

What changed, already worked out for you:
${comparison.differences
  .map((d) => `- ${d.field}: ${d.from} → ${d.to} (${d.change > 0 ? '+' : ''}${d.change})`)
  .join('\n')}

Lead with whether their take-home went up or down and by how much, then give
the reason. Amounts are in ${currency}. Do not use a table. Do not greet them.`
      : `Explain this payslip to the employee who received it, in two or three
sentences of plain English.

${JSON.stringify(comparison.current)}

This is their first payslip, so there is nothing to compare it with. Say what
makes up the pay. Report the figures exactly; do not recompute anything.
Amounts are in ${currency}. Do not use a table. Do not greet them.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.getOrThrow<string>('AI_MODEL'),
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            // No catalogue here: this call is handed its figures and has no
            // tools, so several hundred tokens of entity listing would buy
            // nothing on a rate-limited tier.
            content: buildSystemPrompt(user, await this.profileSnapshot(user), {
              catalogue: false,
            }),
          },
          { role: 'user', content: prompt },
        ],
      });
      return { explanation: response.choices[0].message.content?.trim() ?? '' };
    } catch (err) {
      return this.handleProviderError(err);
    }
  }

  /** Friendly names for the "thinking" line in the UI. */
  static labelFor(tool: string) {
    return TOOL_LABELS[tool] ?? 'Looking that up';
  }

  // ── Internals ───────────────────────────────────────────────────────

  /**
   * Stable facts only. A balance or a percentage in the prompt would be
   * quoted back later in the conversation instead of re-read, and would
   * quietly go stale the moment anything changed.
   */
  private async profileSnapshot(user: JwtUser): Promise<ProfileSnapshot | null> {
    if (!user.employeeId) return null;

    const e = await this.prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: {
        employeeCode: true, designation: true, joiningDate: true,
        employmentStatus: true,
        department: { select: { name: true } },
      },
    });
    if (!e) return null;

    const months = Math.floor(
      (Date.now() - e.joiningDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
    );
    const years = Math.floor(months / 12);
    const rest = months % 12;

    return {
      employeeCode: e.employeeCode,
      jobTitle: e.designation,
      department: e.department.name,
      joined: new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      }).format(e.joiningDate),
      service:
        years > 0
          ? `${years} year${years === 1 ? '' : 's'}${rest ? ` ${rest} month${rest === 1 ? '' : 's'}` : ''}`
          : `${months} month${months === 1 ? '' : 's'}`,
      employmentStatus: e.employmentStatus,
    };
  }

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
        // Groq's free tier caps tokens per minute, and the headers say
        // exactly how long. "In a moment" makes the user retry immediately
        // and fail again.
        const wait =
          (err.headers as Record<string, string> | undefined)?.[
            'x-ratelimit-reset-tokens'
          ] ??
          (err.headers as Record<string, string> | undefined)?.['retry-after'];
        throw new ServiceUnavailableException(
          wait
            ? `The assistant has hit its rate limit. Try again in ${wait}.`
            : 'The assistant has hit its rate limit. Try again shortly.',
        );
      }
      throw new ServiceUnavailableException('The assistant is unavailable.');
    }
    this.logger.error('Assistant failed', err as Error);
    throw new ServiceUnavailableException('The assistant is unavailable.');
  }
}
