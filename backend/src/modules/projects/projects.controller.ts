import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post,
} from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { HR_AND_ABOVE } from '../../common/enums/role.enum.js';
import {
  AddMemberDto, SetMinimumDto, UpsertProjectDto, UpsertTeamDto,
} from './dto/project.dto.js';

/**
 * HR owns this. Everyone can be affected by a minimum — it decides whether
 * their leave goes through on its own — but only HR sets one.
 */
@Controller('projects')
@Roles(...HR_AND_ABOVE)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Post()
  @Audit('PROJECT_CREATED', 'project')
  create(@Body() dto: UpsertProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  @Audit('PROJECT_UPDATED', 'project')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @Audit('PROJECT_DELETED', 'project')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projects.remove(id);
  }

  // ── Teams ───────────────────────────────────────────────────────────

  @Post(':id/teams')
  @Audit('PROJECT_TEAM_CREATED', 'project_team')
  addTeam(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertTeamDto) {
    return this.projects.addTeam(id, dto);
  }

  @Patch('teams/:teamId')
  @Audit('PROJECT_TEAM_UPDATED', 'project_team')
  updateTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: UpsertTeamDto,
  ) {
    return this.projects.updateTeam(teamId, dto);
  }

  /**
   * Its own route because it is the field HR actually changes, and because
   * changing it changes which leave goes through without a person. That is
   * worth an audit entry of its own rather than being buried in a general
   * team update.
   */
  @Patch('teams/:teamId/minimum')
  @Audit('PROJECT_TEAM_MINIMUM_SET', 'project_team')
  setMinimum(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SetMinimumDto,
  ) {
    return this.projects.setMinimum(teamId, dto);
  }

  @Delete('teams/:teamId')
  @Audit('PROJECT_TEAM_DELETED', 'project_team')
  removeTeam(@Param('teamId', ParseIntPipe) teamId: number) {
    return this.projects.removeTeam(teamId);
  }

  // ── Membership ──────────────────────────────────────────────────────

  @Post('teams/:teamId/members')
  @Audit('PROJECT_MEMBER_ADDED', 'project_team')
  addMember(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: AddMemberDto,
  ) {
    return this.projects.addMember(teamId, dto);
  }

  @Delete('members/:memberId')
  @Audit('PROJECT_MEMBER_REMOVED', 'project_team')
  removeMember(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.projects.removeMember(memberId);
  }
}
