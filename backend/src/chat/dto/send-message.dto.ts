import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for sending a chat message (both starting a conversation and continuing
 * one). The conversation id, when applicable, comes from the path — never the
 * body. Ownership is always derived from the authenticated token.
 *
 * The text is bounded to protect the model and the service; oversized or empty
 * input is rejected with `400` by the global `ValidationPipe`.
 */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
