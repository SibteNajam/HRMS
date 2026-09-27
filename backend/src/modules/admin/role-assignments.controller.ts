import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { RoleAssignmentsService } from './role-assignments.service.js';
import { CreateRoleAssignmentDto } from './dto/create-role-assignment.dto.js';

/**
 * Pre-assigning a role to an email address, before that person signs up.
 *
 * ADMIN only — this is the mechanism that grants privilege, so it is the one
 * endpoint set that must never be reachable by HR.
 */
@Controller('admin/role-assignments')
@Roles(Role.ADMIN)
export class RoleAssignmentsController {
  constructor(private readonly service: RoleAssignmentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @Audit('ROLE_ASSIGNMENT_CREATED', 'role_assignment')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateRoleAssignmentDto) {
    return this.service.create(user.sub, dto);
  }

  @Delete(':id')
  @Audit('ROLE_ASSIGNMENT_REVOKED', 'role_assignment')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  /** Change the role of an account that already exists. */
  @Post('promote')
  @Audit('USER_ROLE_CHANGED', 'user')
  promote(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateRoleAssignmentDto,
  ) {
    return this.service.promoteExistingUser(user, dto.email, dto.role);
  }
}
