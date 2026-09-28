# 09 — AI Layer

How the AI is wired in, what it is allowed to do, and the guardrails that keep it
from doing anything else.

## Provider: Groq, not Claude

The documents originally specified Claude. The build uses **Groq**, which
serves open models behind an OpenAI-compatible API on a free tier — the
deciding factor for a student project with no budget.

```bash
npm install openai
```

```ts
new OpenAI({
  apiKey: config.get('GROQ_API_KEY'),
  baseURL: 'https://api.groq.com/openai/v1',
});
```

| | Claude plan | Groq build |
|---|---|---|
| Model | `claude-opus-5` | `openai/gpt-oss-120b`, 131k context |
| Tool calling | Yes | **Yes — verified** |
| PDF input | Native | **Not supported** — text must be extracted first |
| Cost | ~$0.015/question | Free, rate limited |

The PDF row is the only real loss, and it only affects recruitment: the plan
to hand the model a CV directly and let it read the layout was
Claude-specific. On Groq that module needs `pdf-parse` first, and a
two-column CV will come out scrambled.

**None of the guardrails change.** They are architectural, not
model-specific.

## Why not RAG

RAG retrieves passages from a document corpus by similarity. Seven of the
eight AI features here ask questions about **structured rows**, and for those
tool calling is not merely adequate — it is safer.

**A vector store cannot enforce row-level permissions.** Embed "Ahmed has 9
days remaining" as a chunk and retrieval works by similarity; nothing in the
vector maths knows that Sara may not see Ahmed's row. Enforcing RBAC would
mean rebuilding it inside the retrieval layer and getting it right for every
chunk.

Tool calling puts the check where it already lives:

```ts
await this.leave.balanceFor(jwtUser.employeeId);
//                          ^^^^^^^^^^^^^^^^^^ the verified session
```

Two more reasons: the data is small and exact — a `SELECT` returns the right
row where similarity search approximates it — and numbers embed badly, with
"9 days" and "90 days" landing in nearly the same place.

**Where RAG would genuinely fit:** an HR policy handbook. Unstructured prose,
identical for every employee, no row-level permissions. The R&D report already
scopes exactly that under Future Enhancements — "document and policy
understanding using RAG" — and that assessment is correct.

## Model and SDK

```bash
npm install @anthropic-ai/sdk zod
```

```ts
// modules/ai/ai.client.ts
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AiClient {
  readonly client: Anthropic;
  readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.model = config.getOrThrow<string>('AI_MODEL'); // claude-opus-5
  }
}
```

The key is read once at boot. It never appears in a controller, never in a
response, and never reaches the browser.

| Model | Model ID | Input $/1M | Output $/1M |
|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | $2.00 | $10.00 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 |

Default to `claude-opus-5`, configured through `AI_MODEL` in `.env`.

## Three tiers of tool

| Tier | Count | Who gets it | Contains |
|---|---|---|---|
| **Self** | 9 | everyone | The asker's own profile, attendance, leave, dues, payslips, team |
| **Shared** | 4 | everyone | Leave policy, working-hours policy, holidays, who is off |
| **HR** | 8 | HR and ADMIN | Employee search, org-wide attendance, the register, approvals, balances, dues, headcount, payroll totals |

The shared tier is the one worth explaining. "What leave types are there" and
"when am I marked late" describe **how the company works**, not what anyone
earns or did. There is nothing to scope, and withholding them made the
assistant refuse reasonable questions.

Before it existed, "what leave types exist?" was answered with the asker's
personal balance — the model reached for the only tool it had, and gave a
policy answer that was actually about one person.

## Relative dates are resolved before the call

The system prompt carries a date block computed server-side:

```
Today: 2026-09-28 (Monday)
This month: 2026-09-01 to 2026-09-30 (month 9, year 2026)
Last month: month 8, year 2026
Next week: 2026-10-05 to 2026-10-11
```

Without it, "who is off next week" was answered by calling the daily register
twice and covering two days of a seven-day week — a confident answer from an
incomplete read, which is worse than a refusal. With `get_who_is_off` taking a
range and the dates anchored, it is one call covering the whole week.

## When to ask instead of answer

Rule 8 tells the model to ask one short clarifying question when a question is
ambiguous **in a way that changes the answer**, and to just answer when it is
not. "Show me their attendance" now returns *"Which employee's attendance
would you like to view?"* rather than picking someone.

Rule 10 covers the empty result: say so plainly and suggest what would help.
An empty list presented as a finding is how a report starts lying.

## The three guardrails

Everything in this module exists to enforce these. They are also the answer when
your examiner asks "how do you stop the AI leaking salaries?".

### Guardrail 1 — Read-only tools

The AI can only reach the database through a fixed list of functions. Each one
is a `SELECT`. There is no `INSERT`, `UPDATE` or `DELETE` tool, so there is no
prompt that can cause a write. This is structural, not a matter of instructing
the model politely.

### Guardrail 2 — Identity comes from the token, never the model

```ts
// The model asked for get_my_payslip({ month: 8 }).
// It does NOT get to say whose payslip.
await this.payrollService.getPayslips(
  jwtUser.employeeId,   // ← from the verified token, server-side
  input.month,
);
```

Employee-scoped tools do not accept an `employeeId` parameter at all. It is not
in the schema, so the model cannot supply one, so it cannot be wrong.

### Guardrail 3 — Tools are filtered by role before the request is sent

An EMPLOYEE's request to Claude physically does not contain the org-wide tools.
The model cannot call a tool it was never given.

```ts
function toolsForRole(role: Role): Anthropic.Tool[] {
  const self = [getMyAttendance, getMyLeaveBalance, getMyPayslip, getMyDues];
  const org  = [searchEmployees, getAttendanceSummary, getPendingLeaveRequests,
                getPayrollSummary, getOutstandingDues];
  return role === Role.EMPLOYEE ? self : [...self, ...org];
}
```

Three independent layers. Any one of them alone would be enough; together they
mean a prompt-injection attempt has nothing to attack.

## Tool definitions

```ts
// modules/ai/tools/employee-tools.ts
export const getMyLeaveBalance: Anthropic.Tool = {
  name: 'get_my_leave_balance',
  description:
    'Get the current leave balance of the logged-in employee, broken down by ' +
    'leave type, for the current year. Use this for any question about ' +
    'remaining, used or allocated leave.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export const getAttendanceSummary: Anthropic.Tool = {
  name: 'get_attendance_summary',
  description:
    'HR only. Attendance summary for all employees over a date range: ' +
    'attendance percentage, late count, absent count. Use for questions like ' +
    '"who has attendance below 80%".',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'YYYY-MM-DD' },
      endDate:   { type: 'string', description: 'YYYY-MM-DD' },
      departmentId: { type: 'integer', description: 'Optional filter' },
    },
    required: ['startDate', 'endDate', 'departmentId'],
    additionalProperties: false,
  },
};
```

`strict: true` guarantees the arguments validate against the schema exactly.
Note that with `strict`, every property must appear in `required` — make
genuinely optional fields nullable rather than omitting them.

**Descriptions are prompt engineering.** The model picks a tool by reading its
description. A vague one causes wrong tool choices, which look like model
stupidity but are a documentation bug. Include an example question in each.

## The chat loop

```ts
// modules/ai/ai.service.ts
async chat(user: JwtUser, conversationId: number, message: string) {
  const history = await this.loadHistory(conversationId);
  const tools = this.toolRegistry.forRole(user.role);

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: message },
  ];

  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await this.ai.client.messages.create({
      model: this.ai.model,
      max_tokens: 2048,
      system: buildSystemPrompt(user),
      tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      await this.saveTurn(conversationId, message, text, toolsUsed);
      return { reply: text, toolsUsed };
    }

    if (response.stop_reason === 'max_tokens') {
      throw new BadRequestException('Response too long. Ask a narrower question.');
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    messages.push({ role: 'assistant', content: response.content });

    // All results go back in ONE user message. Splitting them across several
    // messages teaches the model to stop making parallel calls.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      toolsUsed.push(call.name);
      try {
        const data = await this.toolRegistry.execute(call.name, call.input, user);
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(data),
        });
      } catch (err) {
        // Return the error to the model, never drop the block — a missing
        // tool_result for an issued tool_use is a 400 on the next request.
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: results });
  }

  throw new BadRequestException('Could not complete the request. Try rephrasing.');
}
```

`MAX_TURNS = 5`. Without a cap, a confused model can loop on tool calls and
spend your credit on nothing.

## The system prompt

```ts
export function buildSystemPrompt(user: JwtUser): string {
  return `
You are the HR assistant for ${ORG_NAME}, an internal HR management system.

The person you are talking to:
- Name: ${user.name}
- Role: ${user.role}
${user.role === 'EMPLOYEE'
  ? '- They may only ever see their own records.'
  : '- They are HR staff and may see records for all employees.'}

Rules you must follow:

1. Answer only from data returned by your tools. If a tool returns nothing,
   say you could not find the information. Never estimate, never guess, and
   never use general knowledge about HR policy as if it were this company's
   policy.

2. Never perform a calculation yourself. Salary, leave balances, overtime and
   dues are calculated by the system and returned by the tools. Report those
   numbers exactly as given. If asked "what would my salary be if...",
   explain the components and say that HR must run the calculation.

3. You cannot change anything. You have no ability to approve leave, update a
   record, or send an email. If asked to, explain what the person should do in
   the application instead.

4. Be concise. Two or three sentences for a simple question. Use a table when
   listing more than three records.

5. Currency is ${CURRENCY}. Dates are DD MMM YYYY.

6. If a question is not about HR, say it is outside what you can help with.

Today's date is ${new Date().toISOString().slice(0, 10)}.
`.trim();
}
```

Rule 2 is the one that matters most. Without it the model will cheerfully do
arithmetic on the numbers it was given, and it will occasionally be wrong.

## Structured output

For features that need JSON rather than prose — CV matching, anomaly
classification — use `messages.parse` with a Zod schema. The response is
validated against the schema, so you never parse free text with a regex.

```ts
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const CvMatchSchema = z.object({
  candidateName: z.string(),
  candidateEmail: z.string(),
  matchScore: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  summary: z.string(),
});

const response = await this.ai.client.messages.parse({
  model: this.ai.model,
  max_tokens: 2048,
  messages: [{ role: 'user', content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
    { type: 'text', text: `Job description:\n${jd}\n\nScore this CV against it.` },
  ]}],
  output_config: { format: zodOutputFormat(CvMatchSchema) },
});

const match = response.parsed_output;   // null if parsing failed — guard it
if (!match) throw new BadRequestException('Could not read this CV.');
```

Note the `document` block: the PDF goes to the model directly. No text
extraction library, and the model sees the layout — which is why a two-column CV
does not come out scrambled.

## Streaming the chat reply

The chat panel should stream so the user sees words appear instead of waiting.

```ts
// Controller — Server-Sent Events
@Sse('chat/stream')
stream(@CurrentUser() user: JwtUser, @Query() dto: ChatQueryDto) {
  return this.aiService.chatStream(user, dto);
}
```

```ts
const stream = this.ai.client.messages.stream({
  model: this.ai.model,
  max_tokens: 2048,
  system: buildSystemPrompt(user),
  messages,
});

stream.on('text', (delta) => subject.next({ data: { type: 'delta', text: delta } }));
const final = await stream.finalMessage();
```

Stream only the final turn. While the model is calling tools there is nothing to
show — emit a `{ type: 'tool', name }` event so the UI can display
"Checking your attendance…".

## Cost control

Three mechanisms, all required:

```ts
// 1. Per-user rate limit
@Throttle({ default: { limit: 20, ttl: 60_000 } })   // 20 questions/minute

// 2. Cap the conversation window — send the last 10 messages, not all of them
const history = all.slice(-10);

// 3. Monthly budget guard
const spent = await this.usage.monthToDateUsd();
if (spent > this.config.get<number>('AI_MONTHLY_BUDGET_USD')) {
  throw new ServiceUnavailableException('AI budget exhausted for this month.');
}
```

The second is the one that silently saves you. Conversation history is resent on
every turn, so a 40-message chat costs several times what a 5-message chat does
for the same final answer.

Record `usage.input_tokens` and `usage.output_tokens` from each response so you
can put real figures in your report.

## Failure handling

The AI is the one part of the system that depends on an external service. It
must never take the rest of the app down with it.

```ts
try {
  return await this.chat(user, conversationId, message);
} catch (err) {
  if (err instanceof Anthropic.RateLimitError) {
    throw new HttpException('Assistant is busy. Try again shortly.', 429);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    throw new ServiceUnavailableException('Assistant is unavailable.');
  }
  if (err instanceof Anthropic.AuthenticationError) {
    this.logger.error('ANTHROPIC_API_KEY is invalid or revoked');
    throw new ServiceUnavailableException('Assistant is unavailable.');
  }
  throw err;
}
```

Every AI screen must work with the assistant switched off. If the chat panel
fails, leave, payroll and attendance keep working — the user just does not get
the explanation. Demo this deliberately: unplug the network, show the app still
running. It proves the architecture.

## Where the AI appears

| Feature | AI does | AI does not |
|---|---|---|
| Chat assistant | Answers questions from tool data | Change anything |
| Payroll | Explains a payslip in English | Compute any figure |
| Attendance | Describes patterns, flags outliers | Mark or edit attendance |
| Leave | Summarises a request, notes missing detail | Approve or reject |
| Dues | Answers queries, drafts reminder text | Record a payment |
| Email | Writes the draft body | Press send |
| Reports | Turns aggregates into a written summary | Produce the aggregates |
| Recruitment | Reads CVs, scores against the JD | Shortlist, reject or hire |

The right-hand column is the project's thesis. Keep it intact.


## Answer first, then offer

An early version told the model to ask a clarifying question whenever a
request was ambiguous. It then met *"tell me about me"* with *"Could you let
me know which details you'd like?"* — asking the user to identify themselves
to a system that already knows exactly who they are.

Two changes fixed it.

### Identity is preloaded, not asked for

The system prompt carries the asker's identity, loaded server-side from their
session before the first token is generated:

```
Name: Ahmed Raza
Employee code: EMP-0002
Job title: Senior Developer
Department: Engineering
Joined: 1 Apr 2024 (2 years 5 months of service)
```

followed by an explicit instruction: *never ask them to identify themselves,
and never ask which employee they mean when they say "me" or "my".*

**Only stable facts go in.** Balances and percentages are deliberately
excluded — a figure sitting in the prompt gets quoted back later in the
conversation instead of re-read, and goes stale the moment anything changes.
Those always come from a tool.

### The rule became answer-first

> Answer first, then offer. Never open with a question when you could give
> something useful. A broad question like "tell me about me" or "how am I
> doing" is **not** ambiguous — it is an invitation to summarise.

Ask only when genuinely unable to proceed: another employee with no name
given, or a month that cannot be inferred.

*"Tell me about me"* now calls five tools and returns profile, leave balance,
90-day attendance, dues and payslips, closing with one line offering more.

## The turn loop must not throw away its work

The loop was capped at five turns and threw when it hit the cap. A summary
legitimately needs five tool calls, so the cap was reached **with all the data
already gathered** — and the user got an error instead of an answer.

On the final turn, tools are withheld and the model is asked to write from
what it has:

```ts
const lastTurn = turn === maxTurns - 1;
const response = await this.client.chat.completions.create({
  messages,
  ...(lastTurn ? {} : { tools, tool_choice: 'auto' }),
});
```

The budget also rose from 5 to 8. Discarding a completed round-trip because a
counter ran out is never the right failure.

## Rate limits are the real constraint

Groq's free tier allows 1,000 requests per day but **8,000 tokens per
minute** — and tokens bind first, because every one of the 21 tool
definitions is resent on every turn of every question.

Two mitigations: tool descriptions are kept terse, since their cost is
multiplied by the turn count; and a 429 reports the actual wait from the
`x-ratelimit-reset-tokens` header rather than a vague "try again shortly",
which just invites an immediate retry that fails again.


## Two different things called "memory"

They get confused constantly, and only one of them is a risk.

### 1. Conversation memory — what the model "remembers"

**The model remembers nothing.** It is stateless: every request is the first
request as far as it is concerned. There is no session on the provider's side
and nothing accumulates there over time.

What looks like memory is us re-sending the conversation:

```
You: "What is my attendance?"
  → sent: [system prompt] [your question]
  ← "93%"

You: "And how many times was I late?"
  → sent: [system prompt] [Q1] [A1] [your question]   ← the whole thing again
  ← "0 times"
```

The history lives in the `ai_messages` table in MySQL, and the last
`AI_HISTORY_WINDOW` (10) messages are replayed on each turn. That is the
entire mechanism.

**The cost implication:** history is re-sent every turn, so a 40-message
conversation costs several times what a 4-message one does for the same
answer. The window is the control, and it is why it is set to 10 rather than
unlimited.

### 2. Process memory — RAM the server holds

This is the one that can actually leak, and it has nothing to do with the AI.
It leaks when something is created and never released: a timer that is never
cleared, a listener never removed, a collection at module scope that only
grows, or a query that loads more rows every month.

## Memory audit

| Risk | Status |
|---|---|
| Timers and listeners | Every one is cleaned up on unmount |
| Module-scope collections | **None.** No `Map`, `Set` or array lives outside a request |
| Prisma client | One singleton via `PrismaService` |
| OpenAI client | One, built in the constructor of a singleton service |
| NestJS provider scope | Default singleton — no `Scope.REQUEST` anywhere |
| Conversation loading | **Bounded** — see below |

Two things were fixed during the audit.

**A dangling copy timer.** `setTimeout(() => setCopied(false), 1500)` in the
chat had no cleanup, so clicking Copy and navigating away within 1.5 seconds
left a timer firing into an unmounted component. Now held in a ref and cleared
on unmount.

**Unbounded conversation loading.** `chat()` loaded *every* message in a
conversation and then used the last ten. A 500-turn conversation meant
loading 1,000 rows to use 10 — on every message sent, growing forever. It now
loads only the window it is going to send, ordered newest-first so the cap
keeps the recent messages rather than the oldest.

## What grows, and what bounds it

| Table | Grows with | Bound |
|---|---|---|
| `attendance` | employees × days | Queries are always scoped to a date range |
| `audit_logs` | every mutation | Read only via the corrections screen, `take: 50` |
| `ai_messages` | chat turns | `getConversation` caps at 100, chat at 10 |
| `notifications` | events | Read with a limit |

Nothing here is read without a bound, so the amount of data in memory at any
moment stays flat as the tables grow. The tables themselves grow, which is
correct — that is a disk question, not a memory one, and for this data volume
it is not a concern for years.
