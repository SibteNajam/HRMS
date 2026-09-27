import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { LeaveService } from './leave.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role, HR_AND_ABOVE } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto.js';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto.js';
import { ListLeaveDto } from './dto/list-leave.dto.js';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  types() {
    return this.leave.leaveTypes();
  }

  @Get('balance/me')
  myBalance(@CurrentUser() user: JwtUser) {
    return this.leave.balanceFor(user.employeeId!);
  }

  @Post('requests')
  @Audit('LEAVE_REQUESTED', 'leave_request')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leave.create(user, dto);
  }

  @Get('requests/me')
  mine(@CurrentUser() user: JwtUser, @Query() dto: ListLeaveDto) {
    return this.leave.mine(user, dto);
  }

  /**
   * The approval queue. Open to every role, because HR and administrators
   * also have leave to approve — the SERVICE scopes what each one sees.
   */
  @Get('requests/pending')
  @Roles(...HR_AND_ABOVE)
  pending(@CurrentUser() user: JwtUser, @Query() dto: ListLeaveDto) {
    return this.leave.pendingFor(user, dto);
  }

  @Get('requests/pending/count')
  @Roles(...HR_AND_ABOVE)
  pendingCount(@CurrentUser() user: JwtUser) {
    return this.leave.pendingCount(user);
  }

  @Get('requests/all')
  @Roles(...HR_AND_ABOVE)
  all(@Query() dto: ListLeaveDto) {
    return this.leave.all(dto);
  }

  /** The facts behind a decision — balance, attendance, coverage, flags. */
  @Get('requests/:id/decision-context')
  @Roles(...HR_AND_ABOVE)
  decisionContext(@Param('id', ParseIntPipe) id: number) {
    return this.leave.decisionContext(id);
  }

  @Get('requests/:id')
  findOne(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.leave.findOne(user, id);
  }

  @Patch('requests/:id/review')
  @Roles(...HR_AND_ABOVE)
  @Audit('LEAVE_REVIEWED', 'leave_request')
  review(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    return this.leave.review(user, id, dto);
  }

  @Patch('requests/:id/cancel')
  @Audit('LEAVE_CANCELLED', 'leave_request')
  cancel(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.leave.cancel(user, id);
  }
}
