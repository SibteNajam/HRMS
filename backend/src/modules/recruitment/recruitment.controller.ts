import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe,
  Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RecruitmentService } from './recruitment.service.js';
import { InterviewService } from './interview.service.js';
import { ApplicationsService } from './applications.service.js';
import { CvInboxService } from './cv-inbox.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { HR_AND_ABOVE } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import {
  AddSlotsDto, AssignPostingDto, DecideDto, MeetingLinkDto, UpsertPostingDto,
} from './dto/recruitment.dto.js';

/** Everything here is HR's. The candidate-facing routes live separately. */
@Controller('recruitment')
@Roles(...HR_AND_ABOVE)
export class RecruitmentController {
  constructor(
    private readonly recruitment: RecruitmentService,
    private readonly interviews: InterviewService,
    private readonly applications: ApplicationsService,
    private readonly inbox: CvInboxService,
  ) {}

  /** Whether email intake and scoring are actually configured. */
  @Get('status')
  status() {
    return { inbox: this.inbox.enabled };
  }

  /** Pull the mailbox now rather than waiting for the next five-minute tick. */
  @Post('inbox/check')
  @HttpCode(HttpStatus.OK)
  @Audit('CV_INBOX_CHECKED', 'recruitment')
  checkInbox() {
    return this.inbox.collect();
  }

  // ── Postings ────────────────────────────────────────────────────────

  @Get('postings')
  listPostings() {
    return this.recruitment.listPostings();
  }

  @Get('postings/:id')
  posting(@Param('id', ParseIntPipe) id: number) {
    return this.recruitment.postingWithAdvert(id);
  }

  /**
   * Creating a posting also lays out its interview times.
   *
   * Together rather than as two steps: a role whose slots were never
   * generated looks fine to HR and shows a shortlisted candidate an empty
   * booking page, which they read as "they changed their mind".
   */
  @Post('postings')
  @Audit('JOB_POSTING_CREATED', 'job_posting')
  async createPosting(@Body() dto: UpsertPostingDto) {
    // Checked before anything is written. Generating slots after the
    // posting exists meant an invalid window left a role created, open and
    // unbookable — the candidate saw an empty page and nobody knew why.
    this.interviews.assertWindowIsValid(dto);

    const posting = await this.recruitment.createPosting(dto);
    const slots = await this.interviews.rebuildSlots(posting.id);
    return { ...posting, slots };
  }

  @Patch('postings/:id')
  @Audit('JOB_POSTING_UPDATED', 'job_posting')
  async updatePosting(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertPostingDto,
  ) {
    this.interviews.assertWindowIsValid(dto);
    const posting = await this.recruitment.updatePosting(id, dto);
    const slots = await this.interviews.rebuildSlots(id);
    return { ...posting, slots };
  }

  // ── Applications ────────────────────────────────────────────────────

  @Get('applications')
  listApplications() {
    return this.applications.list();
  }

  /**
   * The best matches, best first — score, then whoever asks for less.
   *
   * A separate route rather than a flag, because it answers a different
   * question: "all of them" is a record, "the top fifteen" is a morning's
   * reading.
   */
  @Get('applications/top')
  topApplications(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.applications.top(Math.min(limit ?? 15, 50));
  }

  @Get('applications/:id')
  application(@Param('id', ParseIntPipe) id: number) {
    return this.applications.one(id);
  }

  /**
   * HR uploading a CV by hand — someone who applied in person, or a CV
   * forwarded from elsewhere. The same pipeline as an emailed one.
   */
  @Post('postings/:id/applications')
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @Audit('APPLICATION_UPLOADED', 'application')
  upload(
    @Param('id', ParseIntPipe) postingId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.applications.uploadFor(postingId, file);
  }

  /** Re-score: the scorer was down, or the description has been sharpened. */
  @Post('applications/:id/screen')
  @HttpCode(HttpStatus.OK)
  @Audit('APPLICATION_SCREENED', 'application')
  screen(@Param('id', ParseIntPipe) id: number) {
    return this.recruitment.screen(id);
  }

  /** For a CV that arrived without a readable job code. */
  @Patch('applications/:id/posting')
  @Audit('APPLICATION_ASSIGNED', 'application')
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPostingDto) {
    return this.applications.assign(id, dto.jobPostingId);
  }

  @Post('applications/:id/decide')
  @HttpCode(HttpStatus.OK)
  @Audit('APPLICATION_DECIDED', 'application')
  decide(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideDto,
  ) {
    return this.applications.decide(user, id, dto.decision, dto.note);
  }

  // ── Interview times ─────────────────────────────────────────────────

  @Post('postings/:id/slots')
  @Audit('INTERVIEW_SLOTS_ADDED', 'job_posting')
  addSlots(@Param('id', ParseIntPipe) id: number, @Body() dto: AddSlotsDto) {
    return this.interviews.addSlots(id, dto.slots, dto.durationMinutes);
  }

  @Delete('slots/:slotId')
  @Audit('INTERVIEW_SLOT_REMOVED', 'interview_slot')
  removeSlot(@Param('slotId', ParseIntPipe) slotId: number) {
    return this.interviews.removeSlot(slotId);
  }

  @Get('interviews')
  listInterviews() {
    return this.interviews.listInterviews();
  }

  /** Paste the Meet or Zoom link; the candidate is emailed it. */
  @Patch('interviews/:id/link')
  @Audit('INTERVIEW_LINK_SET', 'interview')
  setMeetingLink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MeetingLinkDto,
  ) {
    return this.interviews.setMeetingLink(id, dto.meetingLink, dto.note);
  }

  @Post('interviews/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Audit('INTERVIEW_CANCELLED', 'interview')
  cancelInterview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideDto,
  ) {
    return this.interviews.cancel(id, dto.note);
  }
}
