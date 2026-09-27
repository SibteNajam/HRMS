import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import { paginated } from '../../common/dto/pagination.dto.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(dto.role ? { role: dto.role } : {}),
      ...(dto.status ? { isActive: dto.status === 'active' } : {}),
      ...(dto.search
        ? {
            OR: [
              { email: { contains: dto.search } },
              { employee: { firstName: { contains: dto.search } } },
              { employee: { lastName: { contains: dto.search } } },
              { employee: { employeeCode: { contains: dto.search } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
        // Explicit select — never return the whole row and trust the client
        // not to display passwordHash.
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              designation: true,
              employmentStatus: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginated(rows, total, { page: dto.page, limit: dto.limit });
  }

  async counts() {
    const [employees, hr, admins, disabled] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.EMPLOYEE, isActive: true } }),
      this.prisma.user.count({ where: { role: Role.HR, isActive: true } }),
      this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
    ]);
    return { employees, hr, admins, disabled };
  }

  async setRole(actor: JwtUser, userId: number, role: Role) {
    const user = await this.get(userId);

    // An admin who demotes themselves locks everyone out of user management.
    if (user.id === actor.sub && role !== Role.ADMIN) {
      throw new BadRequestException('You cannot remove your own admin access');
    }
    if (user.role === role) {
      throw new BadRequestException(`This account is already ${role}`);
    }
    await this.assertNotLastAdmin(user.id, user.role as Role, role);

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true, isActive: true },
    });
  }

  /**
   * Disable rather than delete. A deleted user orphans payslips, leave
   * requests and audit rows — all of which are records that must survive the
   * person leaving. Disabling blocks login and keeps the history intact.
   */
  async setStatus(actor: JwtUser, userId: number, isActive: boolean) {
    const user = await this.get(userId);

    if (user.id === actor.sub && !isActive) {
      throw new BadRequestException('You cannot disable your own account');
    }
    if (user.isActive === isActive) {
      throw new BadRequestException(
        `This account is already ${isActive ? 'active' : 'disabled'}`,
      );
    }
    if (!isActive && user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(user.id, Role.ADMIN, Role.EMPLOYEE);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, role: true, isActive: true },
    });
  }

  private async get(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  /** Losing the last active admin makes the system unadministrable. */
  private async assertNotLastAdmin(id: number, from: Role, to: Role) {
    if (from !== Role.ADMIN || to === Role.ADMIN) return;
    const remaining = await this.prisma.user.count({
      where: { role: Role.ADMIN, isActive: true, id: { not: id } },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        'This is the last active administrator. Promote another account first.',
      );
    }
  }
}
