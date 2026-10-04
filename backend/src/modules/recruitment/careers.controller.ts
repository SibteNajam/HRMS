import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param,
  Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { RecruitmentService } from './recruitment.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { formatOf } from './cv-parser.js';
import { ApplyDto } from './dto/recruitment.dto.js';

/** A CV larger than this is not a CV. */
const MAX_CV_BYTES = 8 * 1024 * 1024;

/**
 * The public careers page. No login — candidates do not have accounts.
 *
 * The advert points here, and the role is in the URL. That one fact
 * removes the whole "which job is this CV for?" problem — there is
 * nothing to infer, and the name, experience and salary are typed by the
 * person they belong to rather than read out of a PDF.
 *
 * Everything reaching these routes is a stranger's input, so the limits
 * are tighter than anywhere else in the system.
 */
@Controller('careers')
@Public()
export class CareersController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  roles() {
    return this.recruitment.openRoles();
  }

  @Get(':code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  role(@Param('code') code: string) {
    return this.recruitment.openRole(code);
  }

  /**
   * Six an hour from one address. Enough for somebody who mistypes their
   * email twice and tries again; not enough to fill the pipeline with
   * rubbish.
   */
  @Post(':code/apply')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 6, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: MAX_CV_BYTES } }))
  async apply(
    @Param('code') code: string,
    @Body() dto: ApplyDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Attach your CV');

    // Checked here as well as in the parser: refusing a .exe before it is
    // written to disk is better than refusing it after.
    if (!formatOf(file.originalname, file.mimetype)) {
      throw new BadRequestException(
        'Send a PDF, a Word document or plain text. We cannot read anything else.',
      );
    }

    return this.recruitment.applyFromForm(code, dto, file);
  }
}
