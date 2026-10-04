import { Module } from '@nestjs/common';
import { RecruitmentController } from './recruitment.controller.js';
import { BookingController } from './booking.controller.js';
import { CareersController } from './careers.controller.js';
import { RecruitmentService } from './recruitment.service.js';
import { ApplicationsService } from './applications.service.js';
import { InterviewService } from './interview.service.js';
import { CvScoringService } from './cv-scoring.service.js';
import { CvInboxService } from './cv-inbox.service.js';

@Module({
  controllers: [RecruitmentController, BookingController, CareersController],
  providers: [
    RecruitmentService,
    ApplicationsService,
    InterviewService,
    CvScoringService,
    CvInboxService,
  ],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
