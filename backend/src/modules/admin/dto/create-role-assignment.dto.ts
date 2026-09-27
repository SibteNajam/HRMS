import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Role } from '../../../common/enums/role.enum.js';

export class CreateRoleAssignmentDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email: string;

  @IsEnum(Role, { message: 'Role must be EMPLOYEE, HR or ADMIN' })
  role: Role;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;
}
