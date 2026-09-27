import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { AdminUsersService } from './users.service.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UpdateUserRoleDto, UpdateUserStatusDto } from './dto/update-user.dto.js';

/**
 * Account administration: who exists, what role they hold, whether they can
 * sign in. ADMIN only — this is where privilege is granted.
 *
 * There is deliberately no DELETE. Accounts are disabled, never removed.
 */
@Controller('admin/users')
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  findAll(@Query() dto: ListUsersDto) {
    return this.users.findAll(dto);
  }

  @Get('counts')
  counts() {
    return this.users.counts();
  }

  @Patch(':id/role')
  @Audit('USER_ROLE_CHANGED', 'user')
  setRole(
    @CurrentUser() actor: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.users.setRole(actor, id, dto.role);
  }

  @Patch(':id/status')
  @Audit('USER_STATUS_CHANGED', 'user')
  setStatus(
    @CurrentUser() actor: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.setStatus(actor, id, dto.isActive);
  }
}
