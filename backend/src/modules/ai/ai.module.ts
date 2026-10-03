import { forwardRef, Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { ToolExecutorService } from './tools/tool-executor.service.js';
import { LeaveRecommendationService } from './leave-recommendation.service.js';
import { LeaveModule } from '../leave/leave.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';

/**
 * Imports the HR modules read-only. Nothing here is exported back to them —
 * the dependency runs one way, so no HR feature can end up calling the AI.
 */
@Module({
  imports: [forwardRef(() => LeaveModule), AttendanceModule],
  controllers: [AiController],
  providers: [AiService, ToolExecutorService, LeaveRecommendationService],
  exports: [AiService, LeaveRecommendationService],
})
export class AiModule {}
