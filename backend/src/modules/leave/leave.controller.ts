import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Inject, forwardRef } from '@nestjs/common';
import { LeaveService } from './leave.service.js';
import { LeaveRecommendationService } from '../ai/leave-recommendation.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Role, HR_AND_ABOVE, ADMIN_ONLY } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto.js';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto.js';
import { ListLeaveDto } from './dto/list-leave.dto.js';
import { UpsertLeaveTypeDto } from './dto/leave-type.dto.js';

@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    @Inject(forwardRef(() => LeaveRecommendationService))
    private readonly recommender: LeaveRecommendationService,
  ) {}

  @Get('types')
  types() {
    return this.leave.leaveTypes();
  }

  @Post('types')
  @Roles(...ADMIN_ONLY)
  @Audit('LEAVE_TYPE_CREATED', 'leave_type')
  createType(@Body() dto: UpsertLeaveTypeDto) {
    return this.leave.createLeaveType(dto);
  }

  @Patch('types/:id')
  @Roles(...ADMIN_ONLY)
  @Audit('LEAVE_TYPE_UPDATED', 'leave_type')
  updateType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertLeaveTypeDto) {
    return this.leave.updateLeaveType(id, dto);
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

  /**
   * AI recommendations for everything in this reviewer's queue, in one call.
   *
   * One request for the whole queue rather than one per card: the free tier
   * is capped on tokens per minute, and a queue of twenty cards would
   * otherwise be twenty round trips.
   *
   * Advice already stored against a request is reused unless the facts
   * behind it have moved, so revisiting the screen costs nothing. `force`
   * re-analyses regardless, for a reviewer who wants a second opinion.
   *
   * This returns advice. It cannot approve anything — the approve endpoint
   * is a separate route a human has to click.
   */
  @Post('requests/recommendations')
  @HttpCode(HttpStatus.OK)
  @Roles(...HR_AND_ABOVE)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  recommendations(
    @CurrentUser() user: JwtUser,
    @Query('force') force?: string,
  ) {
    return this.recommender.recommendForQueue(user, force === 'true');
  }

  @Get('requests/pending/count')
  @Roles(...HR_AND_ABOVE)
  pendingCount(@CurrentUser() user: JwtUser) {
    return this.leave.pendingCount(user);
  }

  @Get('balances')
  @Roles(...HR_AND_ABOVE)
  allBalances(
    @Query('year') year?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.leave.allBalances(
      year ? Number(year) : new Date().getFullYear(),
      departmentId ? Number(departmentId) : undefined,
      search || undefined,
    );
  }

  /** Who is off this month. Visible to everyone — no reasons, no salary. */
  @Get('calendar')
  calendar(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const now = new Date();
    return this.leave.calendar(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
      departmentId ? Number(departmentId) : undefined,
    );
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
