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

  /**
   * What the AI recommended when the reviewer decided, if it had been asked.
   *
   * Recorded so the audit trail shows whether a human followed or overrode
   * the advice. Without it there is no way to tell a considered decision from
   * a rubber stamp, which is the thing §14's human-in-the-loop design exists
   * to guarantee.
   */
  @IsOptional()
  @IsIn(['APPROVE', 'REVIEW', 'REJECT'])
  aiVerdict?: 'APPROVE' | 'REVIEW' | 'REJECT';
}
