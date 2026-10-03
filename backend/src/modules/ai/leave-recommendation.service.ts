import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { LeaveService } from '../leave/leave.service.js';

export type Verdict = 'APPROVE' | 'REVIEW' | 'REJECT';

export interface LeaveRecommendation {
  requestId: number;
  verdict: Verdict;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  /** The facts the verdict rests on, so HR can check the reasoning. */
  basis: string[];
}

/**
 * Recommends a decision on each pending leave request.
 *
 * The R&D report §14 is explicit about the shape of this:
 *
 *   AI analyzes data → AI generates insight/recommendation
 *     → HR reviews → HR approves/rejects → system performs authorized action
 *
 * and §9: "provide recommendations for HR review rather than making
 * high-impact decisions autonomously".
 *
 * So this returns a recommendation and nothing else. There is no code path
 * from here to an approval — the approve endpoint is reached only by a human
 * clicking it, and it re-checks everything itself.
 */
@Injectable()
export class LeaveRecommendationService {
  private readonly logger = new Logger(LeaveRecommendationService.name);
  private readonly client: OpenAI | null;

  constructor(
    private readonly config: ConfigService,
    private readonly leave: LeaveService,
  ) {
    const apiKey = config.get<string>('GROQ_API_KEY');
    this.client = apiKey
      ? new OpenAI({ apiKey, baseURL: config.getOrThrow<string>('GROQ_BASE_URL') })
      : null;
  }

  async recommendForQueue(user: JwtUser): Promise<LeaveRecommendation[]> {
    if (!this.client) {
      throw new ServiceUnavailableException('The assistant is not configured.');
    }

    const queue = await this.leave.pendingFor(user, {
      page: 1, limit: 25, skip: 0,
    } as never);

    if (queue.data.length === 0) return [];

    // Everything the model sees is already computed by the rules engine.
    // It weighs facts; it does not produce them.
    const cases = queue.data.map((r) => {
      const d = r.decision;
      return {
        id: r.id,
        employee: `${r.employee.firstName} ${r.employee.lastName}`,
        role: r.employee.user?.role ?? 'EMPLOYEE',
        leaveType: r.leaveType.name,
        paid: r.leaveType.isPaid,
        days: Number(r.days),
        from: r.startDate.toISOString().slice(0, 10),
        to: r.endDate.toISOString().slice(0, 10),
        reason: r.reason,
        balanceRemaining: d?.balance.remaining,
        balanceAfterApproval: d?.balance.afterApproval,
        attendancePercent: d?.attendance.percentage,
        attendancePrevious: d?.attendance.previousPercentage,
        lateArrivals: d?.attendance.lateCount,
        absences: d?.attendance.absentDays,
        teamSize: d?.coverage.departmentSize,
        othersOffSameDates: d?.coverage.othersOffInRange,
        othersOffNames: d?.coverage.othersOffNames,
        tenureMonths: d?.history.tenureMonths,
        daysTakenThisYear: d?.history.daysTakenThisYear,
        rejectedThisYear: d?.history.rejectedThisYear,
        rulesEngineFlags: d?.flags.map((f) => `${f.label}: ${f.detail}`) ?? [],
      };
    });

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.getOrThrow<string>('AI_MODEL'),
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify({ requests: cases }) },
        ],
      });

      const raw = response.choices[0].message.content ?? '{}';
      const parsed = JSON.parse(raw) as { recommendations?: unknown[] };
      return this.validate(parsed.recommendations ?? [], cases.map((c) => c.id));
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.logger.error('Model returned unparseable JSON');
        throw new ServiceUnavailableException(
          'The assistant returned something unreadable. Try again.',
        );
      }
      if (err instanceof OpenAI.APIError && err.status === 429) {
        throw new ServiceUnavailableException(
          'The assistant has hit its rate limit. Try again shortly.',
        );
      }
      this.logger.error('Recommendation failed', err as Error);
      throw new ServiceUnavailableException('The assistant is unavailable.');
    }
  }

  /**
   * Never trust the shape of model output.
   *
   * A hallucinated request id would attach a recommendation to the wrong
   * person's leave, so anything not in the queue we sent is dropped.
   */
  private validate(raw: unknown[], validIds: number[]): LeaveRecommendation[] {
    const allowed = new Set(validIds);
    const verdicts = new Set<Verdict>(['APPROVE', 'REVIEW', 'REJECT']);
    const confidences = new Set(['HIGH', 'MEDIUM', 'LOW']);

    return raw.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const r = item as Record<string, unknown>;
      const id = Number(r.requestId ?? r.id);
      if (!allowed.has(id)) {
        this.logger.warn(`Dropped recommendation for unknown request ${id}`);
        return [];
      }
      const verdict = String(r.verdict ?? '').toUpperCase() as Verdict;
      if (!verdicts.has(verdict)) return [];

      const confidence = String(r.confidence ?? 'MEDIUM').toUpperCase();
      return [{
        requestId: id,
        verdict,
        confidence: (confidences.has(confidence) ? confidence : 'MEDIUM') as
          LeaveRecommendation['confidence'],
        reason: String(r.reason ?? '').slice(0, 400),
        basis: Array.isArray(r.basis)
          ? r.basis.slice(0, 5).map((b) => String(b).slice(0, 160))
          : [],
      }];
    });
  }
}

const SYSTEM = `You advise an HR reviewer on leave requests. You do not decide
them — a person reads your recommendation and clicks approve or reject.

Return JSON only, in this exact shape:
{"recommendations":[{"requestId":<number>,"verdict":"APPROVE"|"REVIEW"|"REJECT","confidence":"HIGH"|"MEDIUM"|"LOW","reason":"<one or two sentences>","basis":["<fact>","<fact>"]}]}

Give exactly one entry per request you were sent, using the id given. Never
invent an id.

VERDICTS
- APPROVE: nothing stands against it. Sufficient balance, attendance within
  normal range, no coverage problem.
- REVIEW: something a human should weigh before deciding — a coverage clash, a
  declining attendance trend, repeated lateness, a reason too thin to judge, or
  a new joiner with little history. Most borderline cases belong here.
- REJECT: only when approving would break a rule. Insufficient balance is the
  main one. Never reject on judgement alone — that is the reviewer's call, not
  yours.

RULES
1. Every number you are given was calculated by the system. Use them as given.
   Do not compute anything, and never state a figure you were not given.
2. "basis" must contain only facts drawn from the data you were sent. It is
   shown to the reviewer so they can check your reasoning against the record.
3. Attendance of null means the person has no attendance history yet. Say that
   rather than treating it as poor attendance.
4. A request from someone in an HR or ADMIN role is reviewed by an
   administrator. Judge it on the same factors; do not treat seniority as a
   reason to approve.
5. Keep "reason" plain and specific. "Balance is sufficient and no one else in
   Engineering is off that week" beats "looks fine".
6. Do not mention being an AI, and do not hedge with phrases like "it appears".`;
