import { IsDateString, IsInt, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLeaveRequestDto {
  @Type(() => Number)
  @IsInt()
  leaveTypeId: number;

  @IsDateString({}, { message: 'Start date must be a valid date' })
  startDate: string;

  @IsDateString({}, { message: 'End date must be a valid date' })
  endDate: string;

  @IsString()
  @Length(10, 500, { message: 'Give a reason of at least 10 characters' })
  reason: string;
}
