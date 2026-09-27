import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

/**
 * The handful of reference lists the signup form needs before anyone is
 * signed in. Deliberately its own controller so it is obvious which data is
 * readable without a session, and it exposes ids and names only.
 */
@Controller('public')
export class PublicDataController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('departments')
  departments() {
    return this.prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
