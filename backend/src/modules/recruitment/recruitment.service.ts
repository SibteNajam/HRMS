import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { extractText, UnreadableCv } from './cv-parser.js';
import { abovePreviewFold, buildAdvert, type AdvertSource } from './advert.js';
import { CvScoringService } from './cv-scoring.service.js';

export interface IncomingCv {
  file: Buffer;
  fileName: string;
  mimeType?: string;
  /** From the email envelope, when the CV arrived that way. */
  fromName?: string;
  fromEmail?: string;
  /** Email subject, read for a job code. */
  subject?: string;
}

/**
 * Receiving, screening and progressing applications.
 *
 * The shape deliberately mirrors leave: a rules-and-model layer produces a
 * score and a recommendation, and a person makes the decision that affects
 * somebody. An automatic email goes only to candidates who passed — nobody
 * is told by a machine that they were not good enough.
 */
@Injectable()
export class RecruitmentService {
  private readonly logger = new Logger(RecruitmentService.name);
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly scorer: CvScoringService,
  ) {
    this.uploadRoot = this.config.get<string>('UPLOAD_DIR') ?? 'uploads';
  }

  // ── Postings ────────────────────────────────────────────────────────

  listPostings() {
    return this.prisma.jobPosting.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { applications: true, slots: true } },
      },
    });
  }

  async getPosting(id: number) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        slots: { orderBy: { startsAt: 'asc' }, include: { interview: true } },
      },
    });
    if (!posting) throw new NotFoundException('Job posting not found');
    return posting;
  }

  /** The posting, plus the advert generated from it. */
  async postingWithAdvert(id: number) {
    const posting = await this.getPosting(id);
    return { ...posting, advert: this.advertFor(posting) };
  }

  /**
   * The advert text for a posting, ready to publish.
   *
   * Generated rather than stored: the moment somebody edits the skills,
   * the advert should change with them. A stored copy is a second truth.
   */
  advertFor(posting: Omit<AdvertSource, 'requiredSkills'> & { requiredSkills: Prisma.JsonValue }) {
    const text = buildAdvert(
      { ...posting, requiredSkills: asStrings(posting.requiredSkills) },
      {
        companyName: this.config.get<string>('COMPANY_NAME') ?? 'AI-HRMS',
        applyEmail:
          this.config.get<string>('IMAP_USER') ||
          this.config.get<string>('SMTP_USER') ||
          'careers@example.com',
        applyUrl: `${this.config.getOrThrow<string>('FRONTEND_URL')}/careers/${posting.code}`,
      },
    );
    return { text, preview: abovePreviewFold(text), characters: text.length };
  }

  async createPosting(dto: {
    code: string; title: string; description: string;
    requiredSkills: string[]; minYearsExperience?: number;
    shortlistThreshold?: number; departmentId?: number;
    status?: 'DRAFT' | 'OPEN' | 'CLOSED';
    location?: string; salaryRange?: string; advertIntro?: string;
    employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
    workMode?: 'ON_SITE' | 'HYBRID' | 'REMOTE';
    interviewFrom?: string; interviewTo?: string;
    interviewStartHour?: number; interviewEndHour?: number;
    breakStartHour?: number; breakEndHour?: number; slotMinutes?: number;
  }) {
    const code = dto.code.trim().toUpperCase();
    const clash = await this.prisma.jobPosting.findUnique({ where: { code } });
    if (clash) throw new ConflictException('A posting with that code already exists');

    const status = dto.status ?? 'DRAFT';
    return this.prisma.jobPosting.create({
      data: {
        code, title: dto.title, description: dto.description,
        requiredSkills: dto.requiredSkills,
        minYearsExperience: dto.minYearsExperience ?? 0,
        shortlistThreshold: dto.shortlistThreshold ?? 70,
        departmentId: dto.departmentId,
        status,
        openedAt: status === 'OPEN' ? new Date() : null,
        location: dto.location,
        employmentType: dto.employmentType ?? 'FULL_TIME',
        workMode: dto.workMode ?? 'ON_SITE',
        salaryRange: dto.salaryRange,
        advertIntro: dto.advertIntro,
        ...interviewWindow(dto),
      },
    });
  }

  async updatePosting(id: number, dto: Partial<{
    title: string; description: string; requiredSkills: string[];
    minYearsExperience: number; shortlistThreshold: number;
    departmentId: number | null; status: 'DRAFT' | 'OPEN' | 'CLOSED';
    location: string; salaryRange: string; advertIntro: string;
    employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
    workMode: 'ON_SITE' | 'HYBRID' | 'REMOTE';
    interviewFrom: string; interviewTo: string;
    interviewStartHour: number; interviewEndHour: number;
    breakStartHour: number; breakEndHour: number; slotMinutes: number;
  }>) {
    const posting = await this.prisma.jobPosting.findUnique({ where: { id } });
    if (!posting) throw new NotFoundException('Job posting not found');

    return this.prisma.jobPosting.update({
      where: { id },
      data: {
        ...dto,
        ...interviewWindow(dto),
        requiredSkills: dto.requiredSkills ?? undefined,
        // Stamp the transitions rather than asking the caller to.
        openedAt:
          dto.status === 'OPEN' && posting.status !== 'OPEN'
            ? new Date()
            : undefined,
        closedAt:
          dto.status === 'CLOSED' && posting.status !== 'CLOSED'
            ? new Date()
            : undefined,
      },
    });
  }

  // ── The careers page ────────────────────────────────────────────────

  /** Open roles, as a stranger sees them. No counts, no thresholds. */
  async openRoles() {
    const postings = await this.prisma.jobPosting.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      include: { department: { select: { name: true } } },
    });

    return postings.map((p) => ({
      code: p.code,
      title: p.title,
      department: p.department?.name ?? null,
      location: p.location,
      employmentType: p.employmentType,
      workMode: p.workMode,
      salaryRange: p.salaryRange,
      intro: p.advertIntro,
      skills: asStrings(p.requiredSkills),
      minYearsExperience: p.minYearsExperience,
      openedAt: p.openedAt,
    }));
  }

  /**
   * One role by its code.
   *
   * Deliberately absent: `description` and `shortlistThreshold`. The
   * description is the screening spec — publishing it tells candidates
   * exactly which words to put in a CV, and the threshold is nobody's
   * business but ours.
   */
  async openRole(code: string) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { code: code.toUpperCase() },
      include: { department: { select: { name: true } } },
    });
    if (!posting || posting.status !== 'OPEN') {
      throw new NotFoundException('That role is not open.');
    }

    return {
      code: posting.code,
      title: posting.title,
      department: posting.department?.name ?? null,
      location: posting.location,
      employmentType: posting.employmentType,
      workMode: posting.workMode,
      salaryRange: posting.salaryRange,
      intro: posting.advertIntro,
      skills: asStrings(posting.requiredSkills),
      minYearsExperience: posting.minYearsExperience,
    };
  }

  /**
   * An application from the careers form.
   *
   * The difference from an emailed CV is certainty: the role is in the
   * URL, and the name, email and experience are typed by the person they
   * belong to rather than inferred from a PDF. The scorer still reads the
   * CV — but it is no longer the only thing we have.
   */
  async applyFromForm(
    code: string,
    details: {
      fullName: string; email: string; phone?: string; address?: string;
      yearsExperience: number; currentSalary?: number; expectedSalary?: number;
    },
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const posting = await this.prisma.jobPosting.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!posting || posting.status !== 'OPEN') {
      throw new NotFoundException('That role is not open.');
    }

    // One application per person per role. A second submission replaces
    // the first rather than creating a duplicate for HR to reconcile.
    const existing = await this.prisma.application.findFirst({
      where: {
        jobPostingId: posting.id,
        candidateEmail: details.email.toLowerCase(),
        status: { notIn: ['REJECTED', 'HIRED'] },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You have already applied for this role. We will be in touch.',
      );
    }

    const application = await this.receive(
      {
        file: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fromName: details.fullName,
        fromEmail: details.email,
      },
      posting.id,
    );

    // Written after scoring so the scorer's own extraction does not
    // overwrite what the candidate told us about themselves.
    await this.prisma.application.update({
      where: { id: application.id },
      data: {
        source: 'FORM',
        candidateName: titleCase(details.fullName),
        candidateEmail: details.email.toLowerCase(),
        candidatePhone: details.phone ?? null,
        candidateAddress: details.address ?? null,
        statedYearsExperience: details.yearsExperience,
        currentSalary: details.currentSalary ?? null,
        expectedSalary: details.expectedSalary ?? null,
      },
    });

    this.logger.log(
      `Careers form: ${details.fullName} applied for ${posting.code}`,
    );

    // Only what the applicant should see back.
    return {
      received: true,
      role: posting.title,
      message:
        'Thank you — your application has been received. We read every one, ' +
        'and you will hear from us by email.',
    };
  }

  // ── Receiving a CV ──────────────────────────────────────────────────

  /**
   * The one path every application takes, whatever brought it in.
   *
   * Nothing here throws on a bad CV. An unreadable file, a missing posting
   * or a scorer that is down all end as NEEDS_REVIEW with the reason
   * attached — somebody applied for a job, and dropping that on the floor
   * because a PDF was awkward is the worst outcome available.
   */
  async receive(cv: IncomingCv, explicitPostingId?: number) {
    const bookingToken = randomBytes(24).toString('base64url');

    let text: string | null = null;
    let parseError: string | null = null;
    try {
      text = await extractText(cv.file, cv.fileName, cv.mimeType);
    } catch (err) {
      parseError = err instanceof UnreadableCv ? err.message : 'The CV could not be read.';
    }

    const posting = await this.resolvePosting(explicitPostingId, cv.subject, text);
    const cvPath = await this.store(cv);

    const application = await this.prisma.application.create({
      data: {
        jobPostingId: posting?.id ?? null,
        candidateName: titleCase(cv.fromName ?? '') || 'Unknown',
        candidateEmail: (cv.fromEmail ?? '').toLowerCase(),
        source: cv.subject !== undefined ? 'EMAIL' : 'FORM',
        cvPath,
        cvFileName: cv.fileName,
        cvText: text,
        bookingToken,
        status: 'RECEIVED',
        decisionNote: parseError ?? (posting ? null : 'No job posting could be matched to this CV.'),
      },
    });

    if (!text || !posting) {
      await this.prisma.application.update({
        where: { id: application.id },
        data: { status: 'NEEDS_REVIEW' },
      });
      this.logger.warn(
        `Application ${application.id} parked for review: ${parseError ?? 'no posting matched'}`,
      );
      return this.getApplication(application.id);
    }

    return this.screen(application.id);
  }

  /**
   * Scores an application and acts on the result.
   *
   * Separate from `receive` so HR can re-run it: a CV that arrived while
   * the scorer was down, or a posting whose description has since been
   * sharpened, can be screened again without the candidate reapplying.
   */
  async screen(applicationId: number) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { posting: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (!application.posting) {
      throw new BadRequestException('Assign this application to a job posting first');
    }
    if (!application.cvText) {
      throw new BadRequestException('This CV has no readable text to score');
    }

    let result;
    try {
      result = await this.scorer.score(application.cvText, {
        title: application.posting.title,
        description: application.posting.description,
        requiredSkills: asStrings(application.posting.requiredSkills),
        minYearsExperience: application.posting.minYearsExperience,
      });
    } catch (err) {
      this.logger.error(`Scoring failed for application ${applicationId}`, err as Error);
      await this.prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'NEEDS_REVIEW',
          decisionNote: 'Automatic screening failed. Score it again, or read it by hand.',
        },
      });
      return this.getApplication(applicationId);
    }

    const shortlisted = result.score >= application.posting.shortlistThreshold;

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        score: result.score,
        scoreReason: result.reason,
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
        yearsExperience: result.yearsExperience,
        scoredAt: new Date(),
        status: shortlisted ? 'SHORTLISTED' : 'SCREENED',
        // The CV is the better source for contact details than an email
        // envelope, which carries whatever address they happened to send from.
        candidateName: result.candidateName
          ? titleCase(result.candidateName)
          : application.candidateName,
        candidateEmail: result.candidateEmail ?? application.candidateEmail,
        candidatePhone: result.candidatePhone ?? application.candidatePhone,
        decisionNote: null,
      },
    });

    if (shortlisted) await this.inviteToInterview(updated.id);

    this.logger.log(
      `Application ${applicationId} scored ${result.score} ` +
        `(threshold ${application.posting.shortlistThreshold}) — ` +
        `${shortlisted ? 'shortlisted' : 'screened out'}`,
    );
    return this.getApplication(applicationId);
  }

  // ── Internals ───────────────────────────────────────────────────────

  /**
   * Which posting a CV belongs to.
   *
   * An email to one address cannot say which job it is for, so the advert
   * asks candidates to quote the code. Finding no code is not an error —
   * it parks the application for HR, who can assign it in one click.
   */
  private async resolvePosting(
    explicitId: number | undefined,
    subject?: string,
    cvText?: string | null,
  ) {
    if (explicitId) {
      const posting = await this.prisma.jobPosting.findUnique({ where: { id: explicitId } });
      if (!posting) throw new NotFoundException('Job posting not found');
      return posting;
    }

    const open = await this.prisma.jobPosting.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    if (open.length === 0) return null;

    // 1. The code, as the advert asked for. Cheap, exact, and right.
    const haystack = (subject ?? '').toUpperCase();
    const byCode = open.find((p) => haystack.includes(p.code.toUpperCase()));
    if (byCode) return byCode;

    // 2. The title, for somebody who wrote "Application for Senior Backend
    //    Engineer" and ignored the code.
    const byTitle = open.find((p) => haystack.includes(p.title.toUpperCase()));
    if (byTitle) return byTitle;

    // 3. The CV itself. Somebody replying to a forwarded screenshot has no
    //    code to quote, and their application is as real as anyone's.
    //    Only a confident match counts: a maybe is filed by a person.
    if (!cvText) return null;

    const match = await this.scorer.matchPosting(
      cvText,
      open.map((p) => ({
        id: p.id, code: p.code, title: p.title,
        requiredSkills: asStrings(p.requiredSkills),
      })),
    );
    if (!match || match.confidence === 'LOW') return null;

    const chosen = open.find((p) => p.id === match.id) ?? null;
    if (chosen) {
      this.logger.log(
        `No code in "${subject ?? '(no subject)'}" — filed against ` +
          `${chosen.code} (${match.confidence}): ${match.reason}`,
      );
    }
    return chosen;
  }

  private async store(cv: IncomingCv): Promise<string | null> {
    try {
      const dir = path.join(this.uploadRoot, 'cvs');
      await mkdir(dir, { recursive: true });
      // Never the candidate's own file name on disk: it is attacker-chosen
      // input and would let a CV called "../../.env" decide where it lands.
      const safe = `${Date.now()}-${randomBytes(6).toString('hex')}${path.extname(cv.fileName).slice(0, 8)}`;
      await writeFile(path.join(dir, safe), cv.file);
      return path.join('cvs', safe);
    } catch (err) {
      this.logger.error('Could not store the CV file', err as Error);
      return null;
    }
  }

  /**
   * Sends the "we would like to take this further" email with the booking
   * link.
   *
   * Public because HR shortlisting somebody by hand has to invite them the
   * same way the scorer does. A manual override that silently skipped the
   * invitation would leave a candidate marked SHORTLISTED who was never
   * told — which looks like the system working right up until nobody turns
   * up to an interview.
   */
  async inviteToInterview(applicationId: number) {
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { posting: true },
    });
    if (!application.candidateEmail) {
      this.logger.warn(`Application ${applicationId} has no email — cannot invite`);
      return;
    }

    const base = this.config.getOrThrow<string>('FRONTEND_URL');
    const firstName = application.candidateName.split(' ')[0];

    await this.mail.send({
      to: application.candidateEmail,
      // Distinct from the rejection subject, which stays neutral. The same
      // line on both would make an invitation indistinguishable from a no
      // in somebody's inbox.
      subject: `Interview invitation — ${application.posting?.title}`,
      body:
        `Dear ${firstName},\n\n` +
        `Thank you for applying for ${application.posting?.title}. We have ` +
        `reviewed your CV and would like to take your application further.\n\n` +
        `Please choose an interview time that suits you using the link below. ` +
        `Times are offered first come, first served, so booking early gives ` +
        `you the most choice.\n\n` +
        `If none of the times work for you, reply to this email and we will ` +
        `arrange another.`,
      action: {
        label: 'Choose your interview time',
        url: `${base}/apply/${application.bookingToken}`,
      },
    });
  }

  private getApplication(id: number) {
    return this.prisma.application.findUniqueOrThrow({
      where: { id },
      include: {
        posting: { select: { id: true, code: true, title: true, shortlistThreshold: true } },
        interview: { include: { slot: true } },
      },
    });
  }
}

/** "SARA AHMED" is how a CV header is typed, not how you greet somebody. */
export function titleCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

function asStrings(value: Prisma.JsonValue): string[] {
  // Stored as JSON, so the shape is whatever was written. Anything that is
  // not already a string is dropped rather than stringified into
  // "[object Object]" and shown to a model as a required skill.
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}


/**
 * The window fields, with the dates parsed.
 *
 * Anchored to UTC: a `new Date('2026-10-01')` in a positive-offset zone is
 * the 30th of September once stored, and every slot built from it lands a
 * day early.
 */
function interviewWindow(dto: {
  interviewFrom?: string; interviewTo?: string;
  interviewStartHour?: number; interviewEndHour?: number;
  breakStartHour?: number; breakEndHour?: number; slotMinutes?: number;
}) {
  return {
    interviewFrom: dto.interviewFrom ? utcDay(dto.interviewFrom) : undefined,
    interviewTo: dto.interviewTo ? utcDay(dto.interviewTo) : undefined,
    interviewStartHour: dto.interviewStartHour,
    interviewEndHour: dto.interviewEndHour,
    // Explicit null clears the break; undefined leaves it alone.
    breakStartHour: dto.breakStartHour ?? null,
    breakEndHour: dto.breakEndHour ?? null,
    slotMinutes: dto.slotMinutes,
  };
}

function utcDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
