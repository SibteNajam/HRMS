import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateRunDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month: number;
  @Type(() => Number) @IsInt() @Min(2020) @Max(2100) year: number;
}

/** Adjustments HR may make while a run is still DRAFT. */
/**
 * The two figures HR sets, each with its own reason.
 *
 * A single shared reason could not say both why a bonus was given and why a
 * deduction was taken, and those are different conversations with the
 * employee. The unpaid-leave deduction has no field here at all — it is
 * computed from approved leave and is not HR's to type over.
 */
export class AdjustPayslipDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) bonus?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherDeductions?: number;

  /** Required by the service whenever the bonus ends up above zero. */
  @IsOptional()
  @IsString()
  @Length(3, 255, { message: 'Say what the bonus is for' })
  bonusReason?: string;

  /** Required by the service whenever the deduction ends up above zero. */
  @IsOptional()
  @IsString()
  @Length(3, 255, { message: 'Say what is being deducted and why' })
  otherDeductionsReason?: string;
}

export class UpdateSalaryDto {
  @Type(() => Number) @IsNumber() @Min(0) baseSalary: number;
  @Type(() => Number) @IsNumber() @Min(0) allowances: number;

  @IsString()
  @Length(5, 255, { message: 'Say why the salary is changing' })
  reason: string;
}
