import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/**
 * Global: several modules need to send mail and none of them should have to
 * import a module to do it.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
