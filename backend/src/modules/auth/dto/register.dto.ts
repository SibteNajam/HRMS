import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 50, { message: 'First name must be 2–50 characters' })
  @Transform(({ value }) => String(value).trim())
  firstName: string;

  @IsString()
  @Length(2, 50, { message: 'Last name must be 2–50 characters' })
  @Transform(({ value }) => String(value).trim())
  lastName: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password: string;

  @IsOptional()
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  designation?: string;
}
