import { IsBoolean, IsEnum } from 'class-validator';
import { Role } from '../../../common/enums/role.enum.js';

export class UpdateUserRoleDto {
  @IsEnum(Role, { message: 'Role must be EMPLOYEE, HR or ADMIN' })
  role: Role;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}
