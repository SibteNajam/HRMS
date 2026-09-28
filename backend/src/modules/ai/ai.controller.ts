import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtUser } from '../../common/types/jwt-user.js';
import { ChatDto } from './dto/chat.dto.js';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Lets the UI show a proper message instead of failing on first use. */
  @Get('status')
  status() {
    return { enabled: this.ai.enabled };
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  // Tighter than the global limit. Every question costs an upstream call,
  // and the free tier is shared across everyone using the app.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@CurrentUser() user: JwtUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.message, dto.conversationId);
  }

  @Get('conversations')
  list(@CurrentUser() user: JwtUser) {
    return this.ai.listConversations(user.sub);
  }

  @Get('conversations/:id')
  one(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.ai.getConversation(user, id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.ai.deleteConversation(user, id);
  }
}
