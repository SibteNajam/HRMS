import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { PayrollService } from './payroll.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ADMIN_ONLY, HR_AND_ABOVE } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { AdjustPayslipDto, CreateRunDto, UpdateSalaryDto } from './dto/payroll.dto.js';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // ── Own ───────────────────────────────────────────────────────────

  @Get('payslips/me')
  mine(@CurrentUser() user: JwtUser) {
    return this.payroll.myPayslips(user.employeeId!);
  }

  @Get('payslips/:id')
  payslip(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.payroll.getPayslip(user, id);
  }

  @Get('payslips/me/compare')
  compare(
    @CurrentUser() user: JwtUser,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.payroll.comparePayslips(user.employeeId!, Number(month), Number(year));
  }

  // ── Runs ──────────────────────────────────────────────────────────

  @Get('runs')
  @Roles(...HR_AND_ABOVE)
  runs() {
    return this.payroll.listRuns();
  }

  /**
   * Creates a DRAFT: a payslip per employee, calculated but not issued.
   * HR may do this — nothing is paid and nothing is deducted yet.
   */
  @Post('runs')
  @Roles(...HR_AND_ABOVE)
  @Audit('PAYROLL_DRAFT_CREATED', 'payroll_run')
  createRun(@CurrentUser() user: JwtUser, @Body() dto: CreateRunDto) {
    return this.payroll.createRun(user, dto.month, dto.year);
  }

  @Get('runs/:id')
  @Roles(...HR_AND_ABOVE)
  run(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.getRun(id);
  }

  @Patch('runs/:runId/payslips/:payslipId')
  @Roles(...HR_AND_ABOVE)
  @Audit('PAYSLIP_ADJUSTED', 'payslip')
  adjust(
    @CurrentUser() user: JwtUser,
    @Param('runId', ParseIntPipe) runId: number,
    @Param('payslipId', ParseIntPipe) payslipId: number,
    @Body() dto: AdjustPayslipDto,
  ) {
    return this.payroll.adjustPayslip(user, runId, payslipId, dto);
  }

  /**
   * Issues the run. ADMIN only and irreversible — a second pair of eyes on
   * the step that actually pays people and takes money off them.
   */
  @Post('runs/:id/finalise')
  @Roles(...ADMIN_ONLY)
  @Audit('PAYROLL_FINALISED', 'payroll_run')
  finalise(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.payroll.finaliseRun(user, id);
  }

  @Delete('runs/:id')
  @Roles(...ADMIN_ONLY)
  @Audit('PAYROLL_DRAFT_DELETED', 'payroll_run')
  deleteRun(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.deleteRun(id);
  }

  // ── Salary structure ──────────────────────────────────────────────

  @Get('structure')
  @Roles(...HR_AND_ABOVE)
  structure() {
    return this.payroll.salaryStructure();
  }

  @Patch('structure/:employeeId')
  @Roles(...ADMIN_ONLY)
  @Audit('SALARY_CHANGED', 'employee')
  updateSalary(
    @CurrentUser() user: JwtUser,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: UpdateSalaryDto,
  ) {
    return this.payroll.updateSalary(user, employeeId, dto);
  }
}
