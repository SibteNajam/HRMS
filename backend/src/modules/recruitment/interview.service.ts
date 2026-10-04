import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  describeWindow, generateSlots, InvalidWindow, validateWindow,
  type InterviewWindow,
} from './interview-schedule.js';

/**
 * Interview times, and candidates booking them.
 *
 * The whole design rests on one database constraint: `Interview.slotId` is
 * unique. Two candidates clicking the same time at the same moment both
 * reach the insert, and exactly one succeeds — the loser is told the time
 * has just gone rather than being double-booked. Checking "is it free?"
 * before writing would leave a gap between the check and the write, and
 * that gap is where the double booking lives.
 */
@Injectable()
export class InterviewService implements OnModuleInit {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /**
   * Fills in any slots that should exist but do not.
   *
   * Slots are derived from a posting's window, so they can be rebuilt from
   * it at any time — which makes them safe to reconcile on boot. Two cases
   * need it: a posting seeded by a migration, where SQL set the window but
   * could not generate the times; and a window whose dates have since
   * rolled past, leaving a role open and unbookable.
   *
   * Only ever adds. A booked slot is never touched, and a posting with
   * future slots is left exactly as it is.
   */
  async onModuleInit() {
    const postings = await this.prisma.jobPosting.findMany({
      where: {
        status: 'OPEN',
        interviewFrom: { not: null },
        slots: { none: { startsAt: { gt: new Date() } } },
      },
      select: { id: true, code: true },
    });

    for (const posting of postings) {
      try {
        const { generated } = await this.rebuildSlots(posting.id);
        if (generated > 0) {
          this.logger.log(`${posting.code}: ${generated} interview slot(s) laid out on boot`);
        }
      } catch (err) {
        // A badly configured window must not stop the application booting.
        this.logger.warn(
          `${posting.code}: could not lay out interview slots — ${(err as Error).message}`,
        );
      }
    }
  }

  // ── HR: the interview window ────────────────────────────────────────

  /**
   * Rejects a window that cannot produce slots, before anything is saved.
   *
   * The failure this prevents: a posting created with hours that run
   * backwards is open, advertised and unbookable. The candidate is
   * shortlisted, emailed, clicks the link and is told there are no times —
   * which reads as "they changed their mind about me".
   */
  assertWindowIsValid(dto: {
    interviewFrom?: string; interviewTo?: string;
    interviewStartHour?: number; interviewEndHour?: number;
    breakStartHour?: number; breakEndHour?: number; slotMinutes?: number;
  }) {
    // No dates means interviews are not scheduled yet, which is allowed.
    if (!dto.interviewFrom || !dto.interviewTo) return;

    try {
      validateWindow({
        from: new Date(dto.interviewFrom),
        to: new Date(dto.interviewTo),
        startHour: dto.interviewStartHour ?? 10,
        endHour: dto.interviewEndHour ?? 17,
        breakStartHour: dto.breakStartHour ?? null,
        breakEndHour: dto.breakEndHour ?? null,
        slotMinutes: dto.slotMinutes ?? 60,
        timeZone: this.timeZone,
      });
    } catch (err) {
      if (err instanceof InvalidWindow) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /**
   * Rebuilds a posting's slots from its interview window.
   *
   * Called whenever the window changes. Slots nobody has booked are
   * replaced; booked ones are left exactly where they are, because a
   * candidate has already been told a time and moving it silently is the
   * one thing this must never do.
   *
   * Returns what changed so HR can see it rather than guess.
   */
  async rebuildSlots(jobPostingId: number) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { id: jobPostingId },
    });
    if (!posting) throw new NotFoundException('Job posting not found');

    if (!posting.interviewFrom || !posting.interviewTo) {
      return { generated: 0, kept: 0, removed: 0, window: null };
    }

    const window: InterviewWindow = {
      from: posting.interviewFrom,
      to: posting.interviewTo,
      startHour: posting.interviewStartHour,
      endHour: posting.interviewEndHour,
      breakStartHour: posting.breakStartHour,
      breakEndHour: posting.breakEndHour,
      slotMinutes: posting.slotMinutes,
      timeZone: this.timeZone,
    };

    let wanted;
    try {
      wanted = generateSlots(window, this.weekendDays);
    } catch (err) {
      if (err instanceof InvalidWindow) throw new BadRequestException(err.message);
      throw err;
    }

    const existing = await this.prisma.interviewSlot.findMany({
      where: { jobPostingId },
      include: { interview: { select: { id: true } } },
    });
    const booked = existing.filter((s) => s.interview);

    const { count: removed } = await this.prisma.interviewSlot.deleteMany({
      where: { jobPostingId, interview: { is: null } },
    });

    // A booked slot stays even if the new window no longer covers it.
    const bookedTimes = new Set(booked.map((s) => s.startsAt.getTime()));
    const { count: generated } = await this.prisma.interviewSlot.createMany({
      data: wanted
        .filter((s) => !bookedTimes.has(s.startsAt.getTime()))
        .map((s) => ({ jobPostingId, startsAt: s.startsAt, endsAt: s.endsAt })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Posting ${jobPostingId}: ${generated} slot(s) generated, ` +
        `${booked.length} booked kept, ${removed} replaced`,
    );

    return {
      generated,
      kept: booked.length,
      removed,
      window: describeWindow(window),
    };
  }

  private get weekendDays() {
    return this.config.get<number[]>('WEEKEND_DAYS') ?? [0, 6];
  }

  /** The zone HR's interview hours are written in. */
  private get timeZone() {
    return this.config.get<string>('COMPANY_TIMEZONE') ?? 'Asia/Karachi';
  }

  // ── HR: offering times ──────────────────────────────────────────────

  /**
   * @param slots start times; each lasts `durationMinutes`.
   *
   * Times already offered are skipped rather than rejected, so HR adding
   * Thursday to a week that already has Monday does not have to deselect
   * what is there.
   */
  async addSlots(
    jobPostingId: number,
    slots: string[],
    durationMinutes = 45,
  ) {
    const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId } });
    if (!posting) throw new NotFoundException('Job posting not found');

    const now = new Date();
    const rows = slots.map((iso) => {
      const startsAt = new Date(iso);
      if (Number.isNaN(startsAt.getTime())) {
        throw new BadRequestException(`"${iso}" is not a time I can read`);
      }
      if (startsAt <= now) {
        throw new BadRequestException('Interview times have to be in the future');
      }
      return {
        jobPostingId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
      };
    });

    const { count } = await this.prisma.interviewSlot.createMany({
      data: rows,
      skipDuplicates: true,
    });
    this.logger.log(`${count} interview slot(s) added to posting ${jobPostingId}`);
    return { added: count, skipped: rows.length - count };
  }

  async removeSlot(slotId: number) {
    const slot = await this.prisma.interviewSlot.findUnique({
      where: { id: slotId },
      include: { interview: true },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.interview) {
      throw new BadRequestException(
        'Somebody has booked this time. Cancel the interview first so they are told.',
      );
    }
    await this.prisma.interviewSlot.delete({ where: { id: slotId } });
    return { message: 'Slot removed' };
  }

  // ── Candidate: the booking page ─────────────────────────────────────

  /**
   * What the candidate sees behind their emailed link.
   *
   * Taken slots are returned alongside free ones, marked. A grid that
   * silently omits them looks like fewer times were ever offered; showing
   * them greyed says "these were available and have gone", which is both
   * true and a reason to choose quickly.
   */
  async bookingPage(token: string) {
    const application = await this.prisma.application.findUnique({
      where: { bookingToken: token },
      include: {
        posting: { select: { id: true, title: true, code: true } },
        interview: { include: { slot: true } },
      },
    });

    // One message for a wrong token and for a real application that was
    // never shortlisted: a stranger guessing tokens learns nothing either way.
    if (!application || !application.posting) {
      throw new NotFoundException('This booking link is not valid.');
    }
    if (!['SHORTLISTED', 'INTERVIEW'].includes(application.status)) {
      throw new NotFoundException('This booking link is not valid.');
    }

    const slots = await this.prisma.interviewSlot.findMany({
      where: { jobPostingId: application.posting.id, startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: { interview: { select: { id: true, applicationId: true } } },
    });

    return {
      candidateName: application.candidateName,
      role: application.posting.title,
      // Never the score or the reasoning. This page is the candidate's.
      booked: application.interview
        ? {
            startsAt: application.interview.slot.startsAt,
            endsAt: application.interview.slot.endsAt,
            meetingLink: application.interview.meetingLink,
          }
        : null,
      slots: slots.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        taken: s.interview !== null && s.interview.applicationId !== application.id,
      })),
    };
  }

  /**
   * Takes a slot, or explains why it could not be taken.
   *
   * The unique key on `slotId` is what makes this safe under a race. The
   * insert is attempted and a unique-violation is read as "somebody else
   * got there first", which is exactly what it means.
   */
  async book(token: string, slotId: number) {
    const application = await this.prisma.application.findUnique({
      where: { bookingToken: token },
      include: { posting: true, interview: true },
    });
    if (!application || !application.posting) {
      throw new NotFoundException('This booking link is not valid.');
    }
    if (application.interview) {
      throw new ConflictException(
        'You already have an interview booked. Use the link in your email to see it.',
      );
    }

    const slot = await this.prisma.interviewSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.jobPostingId !== application.posting.id) {
      throw new NotFoundException('That time is not available for this role.');
    }
    if (slot.startsAt <= new Date()) {
      throw new BadRequestException('That time has already passed. Choose another.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.interview.create({
          data: { applicationId: application.id, slotId: slot.id },
        });
        await tx.application.update({
          where: { id: application.id },
          data: { status: 'INTERVIEW' },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Somebody booked that time a moment ago. Please choose another.',
        );
      }
      throw err;
    }

    await this.confirm(application.id);
    this.logger.log(`Application ${application.id} booked slot ${slot.id}`);
    return this.bookingPage(token);
  }

  // ── HR: managing what was booked ────────────────────────────────────

  listInterviews() {
    return this.prisma.interview.findMany({
      orderBy: { slot: { startsAt: 'asc' } },
      include: {
        slot: true,
        application: {
          include: { posting: { select: { id: true, code: true, title: true } } },
        },
      },
    });
  }

  /**
   * Attaches the joining details and tells the candidate.
   *
   * The link itself is made by hand — a Meet or Zoom room, set up by
   * whoever is running the interview. Automating that would mean holding
   * calendar credentials for an entire organisation to save one paste.
   *
   * What is NOT manual is the telling. The confirmation email promised
   * joining details nearer the time, and a promise kept by somebody
   * remembering to send an email is a promise broken eventually.
   */
  async setMeetingLink(id: number, link: string, note?: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        slot: true,
        application: { include: { posting: { select: { title: true } } } },
      },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.status !== 'SCHEDULED') {
      throw new BadRequestException('This interview is no longer scheduled');
    }

    const updated = await this.prisma.interview.update({
      where: { id },
      data: { meetingLink: link, notes: note ?? interview.notes },
    });

    const when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: this.timeZone,
    }).format(interview.slot.startsAt);

    await this.mail.send({
      to: interview.application.candidateEmail,
      subject: `Joining details — ${interview.application.posting?.title}`,
      body:
        `Dear ${interview.application.candidateName.split(' ')[0]},\n\n` +
        `Here are the joining details for your interview on ${when}.\n\n` +
        (note ? `${note}\n\n` : '') +
        `If anything changes, reply to this email and we will sort it out.`,
      action: { label: 'Join the interview', url: link },
    });

    this.logger.log(`Interview ${id}: joining details sent`);
    return updated;
  }

  async cancel(id: number, reason: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: { application: { include: { posting: true } }, slot: true },
    });
    if (!interview) throw new NotFoundException('Interview not found');

    await this.prisma.$transaction(async (tx) => {
      // Deleted rather than marked cancelled: the slot has to become
      // bookable again, and the unique key holds it otherwise.
      await tx.interview.delete({ where: { id } });
      await tx.application.update({
        where: { id: interview.applicationId },
        data: { status: 'SHORTLISTED', decisionNote: reason.slice(0, 500) },
      });
    });

    const base = this.config.getOrThrow<string>('FRONTEND_URL');
    await this.mail.send({
      to: interview.application.candidateEmail,
      subject: `Your interview for ${interview.application.posting?.title} has been cancelled`,
      body:
        `Dear ${interview.application.candidateName.split(' ')[0]},\n\n` +
        `We have had to cancel the interview time you chose. We are sorry ` +
        `for the inconvenience.\n\n${reason}\n\n` +
        `Please pick another time that suits you.`,
      action: {
        label: 'Choose another time',
        url: `${base}/apply/${interview.application.bookingToken}`,
      },
    });

    return { message: 'Interview cancelled and the candidate told' };
  }

  private async confirm(applicationId: number) {
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { posting: true, interview: { include: { slot: true } } },
    });
    if (!application.interview) return;

    const when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Karachi',
    }).format(application.interview.slot.startsAt);

    await this.mail.send({
      to: application.candidateEmail,
      subject: `Interview confirmed — ${application.posting?.title}`,
      body:
        `Dear ${application.candidateName.split(' ')[0]},\n\n` +
        `Your interview for ${application.posting?.title} is confirmed for ` +
        `${when} (Pakistan time).\n\n` +
        (application.interview.meetingLink
          ? `Join here: ${application.interview.meetingLink}\n\n`
          : `We will send joining details nearer the time.\n\n`) +
        `If you need to change it, reply to this email.`,
    });
  }
}
