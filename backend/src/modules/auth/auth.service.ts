import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { Role } from '../../common/enums/role.enum.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Self-registration.
   *
   * The role is never taken from the request body, and never inferred from the
   * email address itself — the person signing up chooses that address, so
   * trusting it would let anyone type their way to ADMIN. It comes from a
   * role_assignments row an ADMIN created beforehand, and defaults to
   * EMPLOYEE when there is none.
   */
  async register(dto: RegisterDto) {
    this.assertDomainAllowed(dto.email);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const { role, assignmentId } = await this.resolveRole(dto.email);

    const department = dto.departmentId
      ? await this.prisma.department.findUnique({ where: { id: dto.departmentId } })
      : await this.prisma.department.findFirst({ orderBy: { id: 'asc' } });

    if (!department) {
      throw new BadRequestException(
        'No departments exist yet. Ask an administrator to create one.',
      );
    }

    const passwordHash = await this.hash(dto.password);
    const year = new Date().getFullYear();
    const leaveTypes = await this.prisma.leaveType.findMany();

    // Employee, login and this year's leave balances are created together —
    // a half-created account cannot sign in and cannot be repaired from the UI.
    const employee = await this.prisma.$transaction(async (tx) => {
      const code = await this.nextEmployeeCode(tx);
      return tx.employee.create({
        data: {
          employeeCode: code,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          departmentId: department.id,
          designation: dto.designation ?? 'Employee',
          joiningDate: new Date(),
          baseSalary: 0,
          user: { create: { email: dto.email, passwordHash, role } },
          leaveBalances: {
            create: leaveTypes.map((lt) => ({
              leaveTypeId: lt.id,
              year,
              // Pro-rated for the remaining months of the year.
              allocated: Math.round(
                (lt.annualQuota * (12 - new Date().getMonth())) / 12,
              ),
              used: 0,
            })),
          },
        },
        include: { user: true },
      });
    });

    if (assignmentId) {
      // Kept, not deleted — the row is the record of who was granted what.
      await this.prisma.roleAssignment.update({
        where: { id: assignmentId },
        data: { claimedAt: new Date() },
      });
    }

    this.logger.log(
      `Registered ${dto.email} as ${employee.employeeCode} with role ${role}` +
        (assignmentId ? ' (pre-assigned)' : ' (default)'),
    );
    return { employeeCode: employee.employeeCode, email: dto.email, role };
  }

  /**
   * Looks the address up in role_assignments. Fails closed: an unlisted
   * address becomes an EMPLOYEE, never anything higher.
   */
  private async resolveRole(
    email: string,
  ): Promise<{ role: Role; assignmentId: number | null }> {
    const assignment = await this.prisma.roleAssignment.findUnique({
      where: { email },
      select: { id: true, role: true, claimedAt: true },
    });

    if (!assignment) {
      if (this.config.getOrThrow<string>('SIGNUP_MODE') === 'invite_only') {
        throw new ForbiddenException(
          'This email has not been invited. Ask an administrator to add it.',
        );
      }
      return { role: Role.EMPLOYEE, assignmentId: null };
    }

    if (assignment.claimedAt) {
      // The account was deleted and someone is trying to re-register against
      // a spent assignment. Do not silently re-grant the elevated role.
      this.logger.warn(`Re-use of a claimed role assignment for ${email}`);
      return { role: Role.EMPLOYEE, assignmentId: null };
    }

    return { role: assignment.role as Role, assignmentId: assignment.id };
  }

  /** Blocks personal addresses when the deployment is domain-restricted. */
  private assertDomainAllowed(email: string) {
    const mode = this.config.getOrThrow<string>('SIGNUP_MODE');
    if (mode === 'open') return;

    const allowed = this.config.getOrThrow<string[]>('ALLOWED_EMAIL_DOMAINS');
    if (allowed.length === 0) return;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !allowed.includes(domain)) {
      throw new ForbiddenException(
        `Registration is limited to ${allowed.map((d) => '@' + d).join(', ')} addresses.`,
      );
    }
  }

  /** EMP-0001, EMP-0002 … sequential, never reused. */
  private async nextEmployeeCode(tx: Prisma.TransactionClient) {
    const last = await tx.employee.findFirst({
      orderBy: { id: 'desc' },
      select: { employeeCode: true },
    });
    const n = last ? Number(last.employeeCode.replace(/\D/g, '')) + 1 : 1;
    return `EMP-${String(n).padStart(4, '0')}`;
  }

  async login(dto: LoginDto, ip: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Same message for unknown email and wrong password. Distinguishing them
    // tells an attacker which addresses exist.
    const invalid = new UnauthorizedException('Invalid email or password');

    if (!user) {
      await this.fakeCompare();
      await this.recordFailure(dto.email, ip);
      throw invalid;
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.recordFailure(dto.email, ip, user.id);
      throw invalid;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const identity: JwtUser = {
      sub: user.id,
      employeeId: user.employeeId,
      email: user.email,
      role: user.role as Role,
      name: user.employee
        ? `${user.employee.firstName} ${user.employee.lastName}`
        : 'Administrator',
    };

    const token = await this.jwt.signAsync(identity, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.getOrThrow<number>('JWT_TTL_SECONDS'),
    });

    return { token, user: identity };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            designation: true,
            joiningDate: true,
            phone: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current one');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hash(dto.newPassword) },
    });

    return { message: 'Password updated' };
  }

  hash(plain: string) {
    return bcrypt.hash(plain, this.config.getOrThrow<number>('BCRYPT_ROUNDS'));
  }

  /**
   * Burn the same time as a real bcrypt compare when the email is unknown, so
   * response timing does not reveal which addresses exist.
   */
  private async fakeCompare() {
    await bcrypt.compare(
      'timing-equaliser',
      '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
    ).catch(() => undefined);
  }

  private async recordFailure(email: string, ip: string, userId = 0) {
    this.logger.warn(`Failed login for ${email} from ${ip}`);
    await this.prisma.auditLog
      .create({
        data: {
          actorUserId: userId,
          action: 'LOGIN_FAILED',
          entity: 'user',
          entityId: userId,
          metadata: { email, ip },
        },
      })
      .catch(() => undefined);
  }
}
