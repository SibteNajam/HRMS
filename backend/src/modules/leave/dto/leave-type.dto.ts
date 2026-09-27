import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpsertLeaveTypeDto {
  @IsString()
  @Length(2, 50)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Quota cannot be negative' })
  @Max(365)
  annualQuota: number;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}
