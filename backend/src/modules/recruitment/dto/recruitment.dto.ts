import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsEmail, IsIn, IsInt,
  IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min,
} from 'class-validator';

export class UpsertPostingDto {
  @IsString() @Length(2, 20) code: string;
  @IsString() @Length(3, 120) title: string;
  @IsString() @Length(40, 8000, {
    message: 'The description is what a CV is scored against — give it some detail',
  })
  description: string;

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(30) @IsString({ each: true })
  requiredSkills: string[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  minYearsExperience?: number;

  /** The bar for an automatic invitation. Per posting: an intern is not a lead. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  shortlistThreshold?: number;

  @IsOptional() @Type(() => Number) @IsInt() departmentId?: number;

  @IsOptional() @IsIn(['DRAFT', 'OPEN', 'CLOSED'])
  status?: 'DRAFT' | 'OPEN' | 'CLOSED';

  // ── Advert fields ───────────────────────────────────────────────────
  // Never scored against. They exist so the advert can be generated from
  // the posting instead of being written a second time somewhere else.

  @IsOptional() @IsString() @Length(2, 160)
  location?: string;

  @IsOptional() @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'])
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';

  @IsOptional() @IsIn(['ON_SITE', 'HYBRID', 'REMOTE'])
  workMode?: 'ON_SITE' | 'HYBRID' | 'REMOTE';

  @IsOptional() @IsString() @Length(2, 120)
  salaryRange?: string;

  /** Advert copy. The description stays the requirements spec. */
  @IsOptional() @IsString() @Length(10, 600)
  advertIntro?: string;

  // ── Interview window ────────────────────────────────────────────────
  // Set once here; every bookable slot is generated from it. HR never
  // picks times one by one, and every candidate sees the same grid.

  /** YYYY-MM-DD. Both or neither — a start with no end schedules nothing. */
  @IsOptional() @IsDateString({}, { message: 'Use a date like 2026-10-01' })
  interviewFrom?: string;

  @IsOptional() @IsDateString({}, { message: 'Use a date like 2026-10-15' })
  interviewTo?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23)
  interviewStartHour?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24)
  interviewEndHour?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23)
  breakStartHour?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24)
  breakEndHour?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(480)
  slotMinutes?: number;
}

export class AddSlotsDto {
  /** ISO timestamps. Each becomes one bookable interview. */
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @IsString({ each: true })
  slots: string[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(480)
  durationMinutes?: number;
}

export class BookSlotDto {
  @Type(() => Number) @IsInt() slotId: number;
}

export class DecideDto {
  @IsIn(['REJECTED', 'HIRED', 'SHORTLISTED'])
  decision: 'REJECTED' | 'HIRED' | 'SHORTLISTED';

  /**
   * Required. A decision about somebody's application that nobody wrote a
   * reason for is one nobody can explain when they ask.
   */
  @IsString() @Length(5, 500, { message: 'Say why' })
  note: string;
}

export class AssignPostingDto {
  @Type(() => Number) @IsInt() jobPostingId: number;
}


/**
 * What a candidate fills in on the careers page.
 *
 * Everything here is typed by the applicant, so everything here is
 * untrusted: the file is capped and sniffed, the numbers are bounded, and
 * nothing is interpolated anywhere. The payoff is that the job is known
 * with certainty — no code to quote, no CV to read to work out which role
 * they meant.
 */
export class ApplyDto {
  @IsString()
  @Length(2, 120, { message: 'Tell us your name' })
  fullName: string;

  @IsEmail({}, { message: 'That email address does not look right' })
  @Length(5, 160)
  email: string;

  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 255)
  address?: string;

  /**
   * Half-year steps. Somebody six months in should not have to round to
   * nought or to one — both are wrong, and one of them reads as a lie.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(50)
  yearsExperience: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  currentSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  expectedSalary?: number;
}


export class MeetingLinkDto {
  /**
   * Where the interview happens. Validated as a URL because it is pasted
   * into an email as a button — a typo there is a candidate who cannot
   * join and does not know why.
   */
  @IsUrl({ require_protocol: true }, { message: 'Paste the full link, including https://' })
  @Length(10, 400)
  meetingLink: string;

  /** Anything else they should know — who they are meeting, what to bring. */
  @IsOptional()
  @IsString()
  @Length(3, 500)
  note?: string;
}
