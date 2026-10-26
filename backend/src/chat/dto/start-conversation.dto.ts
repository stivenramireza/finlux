import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for starting a new conversation with a first message. Reuses the same
 * message constraints as {@link SendMessageDto}, plus an optional title.
 */
export class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
