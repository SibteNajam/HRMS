import { Module } from '@nestjs/common';
import { RoleAssignmentsController } from './role-assignments.controller.js';
import { RoleAssignmentsService } from './role-assignments.service.js';
import { AdminUsersController } from './users.controller.js';
import { AdminUsersService } from './users.service.js';

@Module({
  controllers: [RoleAssignmentsController, AdminUsersController],
  providers: [RoleAssignmentsService, AdminUsersService],
})
export class AdminModule {}
