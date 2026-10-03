import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dateOnly } from '../attendance/attendance-policy.js';
import type {
  AddMemberDto, SetMinimumDto, UpsertProjectDto, UpsertTeamDto,
} from './dto/project.dto.js';

/**
 * Projects, the teams on them, and how many people each team needs.
 *
 * This exists for one reason: leave cannot be judged on the person alone.
 * A request with a healthy balance and good attendance can still be the one
 * that leaves a project team unable to run, and nothing in the system knew
 * about projects until now.
 *
 * `minimumStaff` is the number that makes it work, and it is set per team
 * rather than per project — a marketing team of three and an engineering
 * team of eight do not need the same cover.
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every project with its teams, each team's minimum, who is on it, and
   * how many of them are off today.
   *
   * The "off today" figure is what makes the page worth opening: a minimum
   * is abstract until you can see how close a team is to it right now.
   */
  async list() {
    const today = dateOnly(new Date());

    const projects = await this.prisma.project.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        teams: {
          orderBy: { name: 'asc' },
          include: {
            department: { select: { id: true, name: true } },
            members: {
              include: {
                employee: {
                  select: {
                    id: true, employeeCode: true, firstName: true, lastName: true,
                    designation: true, employmentStatus: true,
                    attendance: {
                      where: { date: today },
                      select: { status: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description,
      status: p.status,
      teams: p.teams.map((t) => {
        // Someone who has left still has a membership row. Counting them as
        // cover would hold leave open against a person who is gone.
        const active = t.members.filter(
          (m) => m.employee.employmentStatus === 'ACTIVE',
        );
        const offToday = active.filter(
          (m) => m.employee.attendance[0]?.status === 'ON_LEAVE',
        );
        return {
          id: t.id,
          name: t.name,
          minimumStaff: t.minimumStaff,
          department: t.department,
          size: active.length,
          offToday: offToday.length,
          availableToday: active.length - offToday.length,
          /** Negative means the team is already under its minimum. */
          headroomToday: active.length - offToday.length - t.minimumStaff,
          members: active.map((m) => ({
            id: m.id,
            employeeId: m.employee.id,
            employeeCode: m.employee.employeeCode,
            name: `${m.employee.firstName} ${m.employee.lastName}`,
            roleOnTeam: m.roleOnTeam ?? m.employee.designation,
            offToday: m.employee.attendance[0]?.status === 'ON_LEAVE',
          })),
        };
      }),
    }));
  }

  async create(dto: UpsertProjectDto) {
    await this.assertNameAndCodeFree(dto.name, dto.code);
    return this.prisma.project.create({
      data: {
        name: dto.name, code: dto.code.toUpperCase(),
        description: dto.description, status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async update(id: number, dto: UpsertProjectDto) {
    await this.requireProject(id);
    await this.assertNameAndCodeFree(dto.name, dto.code, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name, code: dto.code.toUpperCase(),
        description: dto.description, status: dto.status,
      },
    });
  }

  async remove(id: number) {
    await this.requireProject(id);
    // Teams and memberships cascade. The leave already approved against
    // this project stays — it happened, whatever became of the project.
    await this.prisma.project.delete({ where: { id } });
    return { message: 'Project deleted' };
  }

  // ── Teams ───────────────────────────────────────────────────────────

  async addTeam(projectId: number, dto: UpsertTeamDto) {
    await this.requireProject(projectId);
    const clash = await this.prisma.projectTeam.findUnique({
      where: { projectId_name: { projectId, name: dto.name } },
    });
    if (clash) throw new BadRequestException('That project already has a team with this name');

    return this.prisma.projectTeam.create({
      data: {
        projectId, name: dto.name,
        minimumStaff: dto.minimumStaff,
        departmentId: dto.departmentId,
      },
    });
  }

  /**
   * The one field HR changes most, so it has its own route.
   *
   * Raising it above the current headcount is allowed and warned about
   * rather than refused: "we need five and have four" is a real situation,
   * and a system that refuses to record it just gets worked around.
   */
  async setMinimum(teamId: number, dto: SetMinimumDto) {
    const team = await this.prisma.projectTeam.findUnique({
      where: { id: teamId },
      include: {
        project: { select: { name: true } },
        members: { select: { employee: { select: { employmentStatus: true } } } },
      },
    });
    if (!team) throw new NotFoundException('Team not found');

    const size = team.members.filter(
      (m) => m.employee.employmentStatus === 'ACTIVE',
    ).length;

    const updated = await this.prisma.projectTeam.update({
      where: { id: teamId },
      data: { minimumStaff: dto.minimumStaff },
    });

    this.logger.log(
      `${team.project.name} · ${team.name} minimum set to ${dto.minimumStaff} (team of ${size})`,
    );

    return {
      ...updated,
      size,
      warning:
        dto.minimumStaff > size
          ? `This team has ${size} ${size === 1 ? 'person' : 'people'} and now ` +
            `requires ${dto.minimumStaff} available. Every leave request will be ` +
            `held for review until someone is added.`
          : null,
    };
  }

  async updateTeam(teamId: number, dto: UpsertTeamDto) {
    const team = await this.prisma.projectTeam.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
    return this.prisma.projectTeam.update({
      where: { id: teamId },
      data: {
        name: dto.name,
        minimumStaff: dto.minimumStaff,
        departmentId: dto.departmentId ?? null,
      },
    });
  }

  async removeTeam(teamId: number) {
    const team = await this.prisma.projectTeam.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
    await this.prisma.projectTeam.delete({ where: { id: teamId } });
    return { message: 'Team deleted' };
  }

  // ── Membership ──────────────────────────────────────────────────────

  async addMember(teamId: number, dto: AddMemberDto) {
    const [team, employee] = await Promise.all([
      this.prisma.projectTeam.findUnique({ where: { id: teamId } }),
      this.prisma.employee.findUnique({ where: { id: dto.employeeId } }),
    ]);
    if (!team) throw new NotFoundException('Team not found');
    if (!employee) throw new NotFoundException('Employee not found');

    const already = await this.prisma.projectTeamMember.findUnique({
      where: {
        projectTeamId_employeeId: { projectTeamId: teamId, employeeId: dto.employeeId },
      },
    });
    if (already) throw new BadRequestException('They are already on this team');

    return this.prisma.projectTeamMember.create({
      data: {
        projectTeamId: teamId,
        employeeId: dto.employeeId,
        roleOnTeam: dto.roleOnTeam ?? employee.designation,
      },
    });
  }

  async removeMember(memberId: number) {
    const member = await this.prisma.projectTeamMember.findUnique({
      where: { id: memberId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    await this.prisma.projectTeamMember.delete({ where: { id: memberId } });
    return { message: 'Removed from the team' };
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async requireProject(id: number) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async assertNameAndCodeFree(name: string, code: string, exceptId?: number) {
    const clash = await this.prisma.project.findFirst({
      where: {
        OR: [{ name }, { code: code.toUpperCase() }],
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new BadRequestException(
        clash.name === name
          ? 'A project with that name already exists'
          : 'A project with that code already exists',
      );
    }
  }
}
