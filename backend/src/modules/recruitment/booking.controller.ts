import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InterviewService } from './interview.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { BookSlotDto } from './dto/recruitment.dto.js';

/**
 * The candidate's page. The only unauthenticated route in the system.
 *
 * Authorisation is the token itself: 24 random bytes, issued per
 * application and sent only to the address on the CV. There is nothing to
 * log in to, because a candidate has no account and should not need one to
 * pick a time.
 *
 * What the token does NOT unlock is the application: no score, no
 * reasoning, no CV. Only the times on offer and the one they chose.
 */
@Controller('apply')
@Public()
export class BookingController {
  constructor(private readonly interviews: InterviewService) {}

  // Tighter than the global limit. An unauthenticated endpoint keyed on a
  // token is the one place somebody might sit and guess.
  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  page(@Param('token') token: string) {
    return this.interviews.bookingPage(token);
  }

  @Post(':token/book')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  book(@Param('token') token: string, @Body() dto: BookSlotDto) {
    return this.interviews.book(token, dto.slotId);
  }
}
