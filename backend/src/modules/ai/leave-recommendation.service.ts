import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LeaveService } from '../leave/leave.service.js';
import {
  contextFingerprint,
  describeRules,
  floorFromFlags,
  type DecisionFlag,
  type Facts,
} from '../leave/leave-decision-context.js';

export type Verdict = 'APPROVE' | 'REVIEW' | 'REJECT';

export interface LeaveRecommendation {
  requestId: number;
  verdict: Verdict;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  /** The facts the verdict rests on, so HR can check the reasoning. */
  basis: string[];
  /**
   * Set when the rules engine overrode what the model proposed. Shown to HR
   * so an override is visible rather than silent.
   */
  adjusted?: string;
}

/** APPROVE < REVIEW < REJECT. A recommendation may be raised, never lowered. */
const STRENGTH: Record<Verdict, number> = { APPROVE: 0, REVIEW: 1, REJECT: 2 };

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
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
  ) {
    const apiKey = config.get<string>('GROQ_API_KEY');
    this.client = apiKey
      ? new OpenAI({ apiKey, baseURL: config.getOrThrow<string>('GROQ_BASE_URL') })
      : null;
  }

  /**
   * @param force re-analyse requests whose stored advice is still valid.
   *
   * Without it, a request already analysed on the same facts costs nothing:
   * the stored row is returned and no upstream call is made. That is what
   * makes leaving the screen and coming back free, and it is most of the
   * value on a tier capped by tokens per minute.
   */
  async recommendForQueue(user: JwtUser, force = false): Promise<LeaveRecommendation[]> {
    const queue = await this.leave.pendingFor(user, {
      page: 1, limit: 25, skip: 0,
    } as never);

    if (queue.data.length === 0) return [];

    const stored = new Map(
      queue.data
        .filter((r) => r.recommendation)
        .map((r) => [r.id, r.recommendation!]),
    );

    // Still about the same situation, so still the same advice.
    const reusable = force
      ? []
      : queue.data.filter((r) => r.recommendation && !r.recommendation.stale);
    const reuseIds = new Set(reusable.map((r) => r.id));
    const pending = queue.data.filter((r) => !reuseIds.has(r.id));

    const cached: LeaveRecommendation[] = reusable.map((r) => ({
      requestId: r.id,
      verdict: stored.get(r.id)!.verdict,
      confidence: stored.get(r.id)!.confidence,
      reason: stored.get(r.id)!.reason,
      basis: stored.get(r.id)!.basis,
      ...(stored.get(r.id)!.adjusted ? { adjusted: stored.get(r.id)!.adjusted } : {}),
    }));

    if (pending.length === 0) return cached;

    if (!this.client) {
      throw new ServiceUnavailableException('The assistant is not configured.');
    }

    // Everything the model sees is already computed by the rules engine.
    // It weighs facts; it does not produce them.
    const floors = new Map<number, ReturnType<typeof floorFromFlags>>();

    const cases = pending.map((r) => {
      const d = r.decision;
      // Decided here, in code, from the rules that fired. The model is asked
      // to explain the case; it is not asked whether the rules apply.
      floors.set(r.id, floorFromFlags((d?.flags ?? []) as DecisionFlag[]));
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
        // Who else can do this job, and whether they are already off. This
        // is what lets the recommendation say "the only other backend
        // engineer is off that week" instead of "coverage looks fine".
        jobTitle: d?.coverage.designation,
        peopleWithSameJobTitle: d?.coverage.sameRoleSize,
        sameJobTitleOffSameDates: d?.coverage.sameRoleOff,
        sameJobTitleOffNames: d?.coverage.sameRoleOffNames,
        tenureMonths: d?.history.tenureMonths,
        daysTakenThisYear: d?.history.daysTakenThisYear,
        rejectedThisYear: d?.history.rejectedThisYear,
        // The code is included so the model can match a flag to the rule
        // book it was given, rather than inferring meaning from the wording.
        rulesEngineFlags: d?.flags.map((f) => `${f.code} — ${f.label}: ${f.detail}`) ?? [],
      };
    });

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.getOrThrow<string>('AI_MODEL'),
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: JSON.stringify({ requests: cases }) },
        ],
      });

      const raw = response.choices[0].message.content ?? '{}';
      const parsed = JSON.parse(raw) as { recommendations?: unknown[] };
      const produced = this.reconcile(
        this.validate(parsed.recommendations ?? [], cases.map((c) => c.id)),
        floors,
      );
      await this.persist(produced, pending, user);
      return [...cached, ...produced];
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

  /**
   * Writes the advice against the request it is about.
   *
   * `factsHash` is stored with it so a later read can tell whether the
   * situation has moved. The model name goes in too — advice from a
   * different model is not the same advice, and swapping AI_MODEL should
   * not leave the queue showing yesterday's reasoning as if it were
   * current.
   */
  private async persist(
    recommendations: LeaveRecommendation[],
    requests: { id: number; reason: string; decision: Facts }[],
    user: JwtUser,
  ) {
    const factsFor = new Map(requests.map((r) => [r.id, r]));
    const model = this.config.getOrThrow<string>('AI_MODEL');

    await this.prisma.$transaction(
      recommendations.flatMap((rec) => {
        const request = factsFor.get(rec.requestId);
        if (!request) return [];

        const row = {
          verdict: rec.verdict,
          confidence: rec.confidence,
          reason: rec.reason,
          basis: rec.basis,
          adjusted: rec.adjusted ?? null,
          model,
          factsHash: contextFingerprint(request.decision, request.reason),
          generatedBy: user.sub,
          generatedAt: new Date(),
        };

        // One row per request: re-analysing replaces the advice rather than
        // accumulating opinions nobody will read.
        return [
          this.prisma.leaveRecommendation.upsert({
            where: { leaveRequestId: rec.requestId },
            create: { leaveRequestId: rec.requestId, ...row },
            update: row,
          }),
        ];
      }),
    );
  }

  /**
   * The rules engine has the last word.
   *
   * Three things happen here, all of them in code:
   *   - a blocking rule forces REJECT, whatever the model said
   *   - a concern raises an APPROVE to REVIEW
   *   - a REJECT with no blocking rule is lowered to REVIEW, because
   *     refusing someone's leave on judgement alone is a person's decision
   *
   * It also fills in any request the model skipped. A missing recommendation
   * used to leave a card blank; now it falls back to what the rules alone
   * say, which is the honest answer rather than no answer.
   */
  private reconcile(
    recommendations: LeaveRecommendation[],
    floors: Map<number, Verdict>,
  ): LeaveRecommendation[] {
    const byId = new Map(recommendations.map((r) => [r.requestId, r]));

    return [...floors.entries()].map(([requestId, floor]) => {
      const model = byId.get(requestId);

      if (!model) {
        return {
          requestId,
          verdict: floor,
          confidence: 'MEDIUM' as const,
          reason: REASON_FOR[floor],
          basis: [],
          adjusted: 'The assistant did not cover this one; the rules engine decided it.',
        };
      }

      if (floor === 'REJECT' && model.verdict !== 'REJECT') {
        return {
          ...model,
          verdict: 'REJECT' as const,
          confidence: 'HIGH' as const,
          adjusted: 'A blocking rule applies, so this cannot be approved as it stands.',
        };
      }

      if (model.verdict === 'REJECT' && floor !== 'REJECT') {
        return {
          ...model,
          verdict: 'REVIEW' as const,
          adjusted:
            'No rule blocks this request, so it is for a person to decide rather ' +
            'than something the assistant can refuse.',
        };
      }

      if (STRENGTH[model.verdict] < STRENGTH[floor]) {
        return {
          ...model,
          verdict: floor,
          adjusted: 'The rules engine raised this — something here needs a person to look.',
        };
      }

      return model;
    });
  }
}

/**
 * Generated, not written.
 *
 * The rule book comes from DECISION_RULES, so a factor added to the leave
 * rules tomorrow is described to the model tomorrow. Nobody edits this
 * string to teach the assistant a new consideration — that is the whole
 * point of keeping the rules as data.
 */
function systemPrompt(): string {
  return `You advise an HR reviewer on leave requests. You do not decide
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
   Write each one as a short readable phrase, not as a field name and a
   value: "93% attendance over 90 days", "14 days of annual leave remaining",
   "Sibte Najam off the same week". Never emit "attendancePercent: 93" — the
   field names in the data you were sent are internal and mean nothing to a
   reviewer.
3. Attendance of null means the person has no attendance history yet. Say that
   rather than treating it as poor attendance.
4. A request from someone in an HR or ADMIN role is reviewed by an
   administrator. Judge it on the same factors; do not treat seniority as a
   reason to approve.
5. Keep "reason" plain and specific. "Balance is sufficient and no one else in
   Engineering is off that week" beats "looks fine".
   When a clash is the point, name the person and the dates: "Ahmed, the only
   other Backend Engineer, is off 14-18 Sep" is what the reviewer needs in
   order to act, and it is already in the data you were sent.
6. Do not mention being an AI, and do not hedge with phrases like "it appears".

RULE BOOK
${describeRules()}`;
}

/** Used when the model skipped a request and the rules decided it alone. */
const REASON_FOR: Record<Verdict, string> = {
  APPROVE: 'No rule flagged anything: balance, attendance and team coverage all look normal.',
  REVIEW: 'The rules engine raised a concern on this request. Read the flags before deciding.',
  REJECT: 'A blocking rule applies — the system would refuse this approval as it stands.',
};

