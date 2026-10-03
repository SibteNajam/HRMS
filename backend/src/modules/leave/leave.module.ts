import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';

@Module({
  // AiModule imports LeaveModule to read leave data for its tools, and
  // LeaveModule needs the recommendation service — forwardRef resolves the
  // cycle without either module reaching into the other's internals.
  imports: [forwardRef(() => AiModule)],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
