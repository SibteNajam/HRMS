import { IsInt, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatDto {
  @IsString()
  @Length(1, 1000, { message: 'Ask a question of up to 1000 characters' })
  message: string;

  /** Omit to start a new conversation. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  conversationId?: number;
}
