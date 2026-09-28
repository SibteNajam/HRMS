import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { HR_AND_ABOVE, ADMIN_ONLY } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import {
  CorrectAttendanceDto, CreateHolidayDto, ListAttendanceDto,
  MonthQueryDto, UpsertAttendanceDto,
} from './dto/attendance.dto.js';
import { dateOnly } from './attendance-policy.js';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // ── Own ───────────────────────────────────────────────────────────

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  checkIn(@CurrentUser() user: JwtUser) {
    return this.attendance.checkIn(user);
  }

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(@CurrentUser() user: JwtUser) {
    return this.attendance.checkOut(user);
  }

  @Get('me/today')
  today(@CurrentUser() user: JwtUser) {
    return this.attendance.today(user);
  }

  @Get('me')
  myMonth(@CurrentUser() user: JwtUser, @Query() query: MonthQueryDto) {
    return this.attendance.monthFor(user.employeeId!, query);
  }

  @Get('me/summary')
  mySummary(@CurrentUser() user: JwtUser) {
    return this.attendance.summaryFor(user.employeeId!);
  }

  // ── Organisation ──────────────────────────────────────────────────

  @Get('register')
  @Roles(...HR_AND_ABOVE)
  register(@Query() dto: ListAttendanceDto) {
    return this.attendance.register(dto);
  }

  @Get('summary')
  @Roles(...HR_AND_ABOVE)
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const end = to ? dateOnly(to) : new Date();
    const start = from ? dateOnly(from) : new Date(end.getTime() - 29 * 86_400_000);
    return this.attendance.organisationSummary(
      start, end, departmentId ? Number(departmentId) : undefined,
    );
  }

  /** A month for any employee — the timesheet screen. */
  @Get('employee/:employeeId')
  @Roles(...HR_AND_ABOVE)
  employeeMonth(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() query: MonthQueryDto,
  ) {
    return this.attendance.monthFor(employeeId, query);
  }

  // ── Corrections ───────────────────────────────────────────────────

  @Patch(':id')
  @Roles(...HR_AND_ABOVE)
  correct(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.attendance.correct(user, id, dto);
  }

  @Post('set')
  @Roles(...HR_AND_ABOVE)
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertAttendanceDto) {
    return this.attendance.upsertForEmployee(user, dto);
  }

  @Get('corrections/log')
  @Roles(...HR_AND_ABOVE)
  corrections(@Query('limit') limit?: string) {
    return this.attendance.corrections(limit ? Number(limit) : 50);
  }

  /** Run the nightly absentee job by hand, for a specific date. */
  @Post('mark-absent')
  @Roles(...HR_AND_ABOVE)
  @Audit('ATTENDANCE_ABSENTEES_MARKED', 'attendance')
  markAbsent(@Body('date') date?: string) {
    return this.attendance.markAbsentees(date ? dateOnly(date) : undefined);
  }

  // ── Holidays ──────────────────────────────────────────────────────

  @Get('holidays/list')
  holidays(@Query('year') year?: string) {
    return this.attendance.holidays(year ? Number(year) : undefined);
  }

  @Post('holidays')
  @Roles(...HR_AND_ABOVE)
  @Audit('HOLIDAY_CREATED', 'holiday')
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.attendance.createHoliday(dto);
  }

  @Delete('holidays/:id')
  @Roles(...ADMIN_ONLY)
  @Audit('HOLIDAY_DELETED', 'holiday')
  deleteHoliday(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.deleteHoliday(id);
  }
}
