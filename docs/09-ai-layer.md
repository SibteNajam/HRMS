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
