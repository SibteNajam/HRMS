import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import type { CreateRoleAssignmentDto } from './dto/create-role-assignment.dto.js';

@Injectable()
export class RoleAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.roleAssignment.findMany({
      orderBy: [{ claimedAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(actorId: number, dto: CreateRoleAssignmentDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException(
        'That account already exists. Use promote to change its role.',
      );
    }

    const duplicate = await this.prisma.roleAssignment.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('This email already has a pending assignment');
    }

    return this.prisma.roleAssignment.create({
      data: { email: dto.email, role: dto.role, note: dto.note, createdBy: actorId },
    });
  }

  async remove(id: number) {
    const found = await this.prisma.roleAssignment.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Assignment not found');
    if (found.claimedAt) {
      throw new BadRequestException(
        'This assignment has been claimed and is kept as a record. ' +
          'Change the account role with promote instead.',
      );
    }
    await this.prisma.roleAssignment.delete({ where: { id } });
    return { message: 'Assignment removed' };
  }

  /** Promotes or demotes an account that already exists. */
  async promoteExistingUser(actor: JwtUser, email: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('No account with that email');

    // An admin who demotes themselves locks everyone out of user management.
    if (user.id === actor.sub && role !== Role.ADMIN) {
      throw new BadRequestException('You cannot remove your own admin access');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    return { ...updated, previousRole: user.role };
  }
}
