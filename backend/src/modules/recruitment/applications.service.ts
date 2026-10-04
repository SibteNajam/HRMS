import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { RecruitmentService } from './recruitment.service.js';
import { topCandidates } from './ranking.js';

/**
 * Reading applications, and the decisions a person makes about them.
 *
 * Split from RecruitmentService on purpose: that one receives and scores,
 * this one is what HR does afterwards. The division is the same one the
 * design rests on — the machine screens, a person decides.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly recruitment: RecruitmentService,
  ) {}

  /**
   * The queue, best first.
   *
   * Anything parked for review comes before anything scored, whatever the
   * score: an application nobody could read is the one at risk of sitting
   * there for a month.
   */
  async list() {
    const rows = await this.prisma.application.findMany({
      orderBy: [{ receivedAt: 'desc' }],
      include: {
        posting: { select: { id: true, code: true, title: true, shortlistThreshold: true } },
        interview: { include: { slot: true } },
      },
    });

    const rank: Record<string, number> = {
      NEEDS_REVIEW: 0, SHORTLISTED: 1, INTERVIEW: 2,
      RECEIVED: 3, SCREENED: 4, HIRED: 5, REJECTED: 6,
    };
    return rows.sort(
      (a, b) =>
        (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
        (b.score ?? -1) - (a.score ?? -1),
    );
  }

  /**
   * The shortlist: scored candidates, best first.
   *
   * Only those the scorer cleared or a person advanced. Somebody below the
   * bar belongs on the full list, where a person can still find them —
   * not on the list that exists to save reading everything.
   */
  async top(limit: number) {
    const rows = await this.prisma.application.findMany({
      where: { status: { in: ['SHORTLISTED', 'INTERVIEW'] }, score: { not: null } },
      include: {
        posting: { select: { id: true, code: true, title: true, shortlistThreshold: true } },
        interview: { include: { slot: true } },
      },
    });

    return topCandidates(
      rows.map((r) => ({
        ...r,
        expectedSalary: r.expectedSalary === null ? null : Number(r.expectedSalary),
      })),
      limit,
    );
  }

  async one(id: number) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        posting: true,
        interview: { include: { slot: true } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  /** HR uploading a CV by hand. Same pipeline as an emailed one. */
  async uploadFor(postingId: number, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Attach a CV');
    return this.recruitment.receive(
      {
        file: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
      postingId,
    );
  }

  /** Attach a parked application to a posting, then score it. */
  async assign(id: number, jobPostingId: number) {
    const [application, posting] = await Promise.all([
      this.prisma.application.findUnique({ where: { id } }),
      this.prisma.jobPosting.findUnique({ where: { id: jobPostingId } }),
    ]);
    if (!application) throw new NotFoundException('Application not found');
    if (!posting) throw new NotFoundException('Job posting not found');

    await this.prisma.application.update({
      where: { id },
      data: { jobPostingId, decisionNote: null },
    });

    // Nothing to score if the CV never produced text; it stays parked and
    // HR reads the attachment themselves.
    if (!application.cvText) return this.one(id);
    return this.recruitment.screen(id);
  }

  /**
   * A person's decision, recorded with their reason.
   *
   * A rejection emails the candidate. That is the one message this system
   * will not send automatically — somebody has to choose to send it, which
   * is the whole reason the scorer never sets this status.
   */
  async decide(
    user: JwtUser,
    id: number,
    decision: 'REJECTED' | 'HIRED' | 'SHORTLISTED',
    note: string,
  ) {
    const application = await this.one(id);

    await this.prisma.application.update({
      where: { id },
      data: { status: decision, decisionNote: note.slice(0, 500) },
    });

    await this.prisma.auditLog
      .create({
        data: {
          actorUserId: user.sub,
          action: `APPLICATION_${decision}`,
          entity: 'application',
          entityId: id,
          metadata: {
            score: application.score,
            previousStatus: application.status,
            note,
          },
        },
      })
      .catch(() => undefined);

    // Shortlisting by hand invites them exactly as the scorer would. Only
    // when it is a change: re-confirming somebody already shortlisted must
    // not email them a second link.
    if (
      decision === 'SHORTLISTED' &&
      application.status !== 'SHORTLISTED' &&
      application.status !== 'INTERVIEW'
    ) {
      await this.recruitment.inviteToInterview(id);
    }

    if (decision === 'REJECTED' && application.candidateEmail) {
      await this.mail.send({
        to: application.candidateEmail,
        subject: `Your application for ${application.posting?.title ?? 'a role with us'}`,
        body:
          `Dear ${application.candidateName.split(' ')[0]},\n\n` +
          `Thank you for taking the time to apply for ` +
          `${application.posting?.title ?? 'a role with us'} and for sharing ` +
          `your CV with us.\n\n` +
          `After reviewing your application we have decided not to take it ` +
          `further on this occasion. This is not a reflection of your ` +
          `abilities, and we would be glad to hear from you about future roles.\n\n` +
          `We wish you the very best with your search.`,
      });
    }

    this.logger.log(
      `Application ${id} marked ${decision} by ${user.email}`,
    );
    return this.one(id);
  }
}
