import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUser } from '../types/jwt-user.js';

/**
 * The verified identity from the session cookie.
 *
 * Always take the employee id from here, never from the request body — that is
 * what prevents "change the id in the payload and read someone else's payslip".
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { user: JwtUser }>();
    return data ? req.user?.[data] : req.user;
  },
);
