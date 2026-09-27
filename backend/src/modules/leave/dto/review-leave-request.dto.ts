import { IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class ReviewLeaveRequestDto {
  @IsIn(['APPROVED', 'REJECTED'], { message: 'Decision must be APPROVED or REJECTED' })
  decision: 'APPROVED' | 'REJECTED';

  /** Required on rejection — the employee is entitled to know why. */
  @ValidateIf((o) => o.decision === 'REJECTED')
  @IsString()
  @Length(5, 255, { message: 'Give a reason for rejecting, at least 5 characters' })
  @IsOptional()
  note?: string;
}
