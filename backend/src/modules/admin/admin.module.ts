import { Module } from '@nestjs/common';
import { RoleAssignmentsController } from './role-assignments.controller.js';
import { RoleAssignmentsService } from './role-assignments.service.js';

@Module({
  controllers: [RoleAssignmentsController],
  providers: [RoleAssignmentsService],
})
export class AdminModule {}
