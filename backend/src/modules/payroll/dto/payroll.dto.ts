import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateRunDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month: number;
  @Type(() => Number) @IsInt() @Min(2020) @Max(2100) year: number;
}

/** Adjustments HR may make while a run is still DRAFT. */
export class AdjustPayslipDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) bonus?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherDeductions?: number;

  @IsString()
  @Length(5, 255, { message: 'Say why this payslip is being adjusted' })
  reason: string;
}

export class UpdateSalaryDto {
  @Type(() => Number) @IsNumber() @Min(0) baseSalary: number;
  @Type(() => Number) @IsNumber() @Min(0) allowances: number;

  @IsString()
  @Length(5, 255, { message: 'Say why the salary is changing' })
  reason: string;
}
