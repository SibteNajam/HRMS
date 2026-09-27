import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { JwtPayload, JwtUser } from '../types/jwt-user.js';

/**
 * Verifies the session cookie and attaches the identity to the request.
 *
 * The token is read from an httpOnly cookie, never from an Authorization
 * header — JavaScript cannot read the cookie, so an XSS bug cannot exfiltrate
 * the session.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const cookieName = this.config.getOrThrow<string>('COOKIE_NAME');
    const token = req.cookies?.[cookieName];

    if (!token) throw new UnauthorizedException('Not authenticated');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      req.user = {
        sub: payload.sub,
        employeeId: payload.employeeId,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired');
    }
  }
}
