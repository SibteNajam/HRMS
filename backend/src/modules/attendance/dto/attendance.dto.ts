import { Type } from 'class-transformer';
import {
  IsDateString, IsInt, IsOptional, IsString, Length, Matches, IsIn,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY'] as const;

export class ListAttendanceDto extends PaginationDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() departmentId?: number;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
}

export class MonthQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @IsOptional() @Type(() => Number) @IsInt() month?: number;
  @IsOptional() @Type(() => Number) @IsInt() employeeId?: number;
}

/** HR correcting a record. Every field optional — usually only one changes. */
export class CorrectAttendanceDto {
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Use HH:MM' })
  checkIn?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Use HH:MM' })
  checkOut?: string;

  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];

  @IsString()
  @Length(5, 255, { message: 'Say why this record is being changed' })
  reason: string;
}

/** HR creating or overwriting a record for a day. */
export class UpsertAttendanceDto {
  @Type(() => Number) @IsInt() employeeId: number;
  @IsDateString() date: string;
  @IsIn(STATUSES) status: (typeof STATUSES)[number];

  @IsOptional() @Matches(/^\d{2}:\d{2}$/) checkIn?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) checkOut?: string;

  @IsString() @Length(5, 255) reason: string;
}

export class CreateHolidayDto {
  @IsDateString() date: string;
  @IsString() @Length(2, 100) name: string;
}
