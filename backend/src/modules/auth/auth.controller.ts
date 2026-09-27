import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtUser } from '../../common/types/jwt-user.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Self-registration. Public by design — the role is fixed to EMPLOYEE in the
   * service, so this endpoint cannot be used to mint privileged accounts.
   * Rate limited harder than login: account creation is the more attractive
   * target for automated abuse.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(dto, ip);
    res.cookie(this.config.getOrThrow<string>('COOKIE_NAME'), token, this.cookieOptions());
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.config.getOrThrow<string>('COOKIE_NAME'), {
      ...this.cookieOptions(),
      maxAge: undefined,
    });
    return { message: 'Signed out' };
  }

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.sub);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto);
  }

  /**
   * httpOnly so JavaScript cannot read it — an XSS bug cannot steal the
   * session. sameSite 'lax' allows top-level navigation while blocking the
   * cross-site POSTs that CSRF relies on.
   */
  private cookieOptions(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      domain: this.config.get<string>('COOKIE_DOMAIN'),
      // Derived from the same value that signs the token, so the cookie can
      // never outlive the JWT or vice versa.
      maxAge: this.config.getOrThrow<number>('JWT_TTL_SECONDS') * 1000,
    };
  }
}
