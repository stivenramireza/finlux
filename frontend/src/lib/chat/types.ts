/**
 * Chat types mirroring the implemented `conversational-agent-backend` contract
 * (Design: Decision 3). These match the verified backend `message` /
 * `conversation` shapes returned by `ChatController`.
 *
 * The presentational `ChatMessage { id, role, text }` in
 * `components/chat/messages.ts` is kept for rendering; a thin adapter maps
 * `ChatMessageDto.content → text` and `role` straight through. We render
 * `content` verbatim as plain text — never parse or recompute money (Req 2.4).
 */

/** Author of a turn, matching the backend `message_role` enum. */
export type MessageRole = 'user' | 'agent';

/** A persisted message turn, as returned by the backend. */
export interface ChatMessageDto {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

/** A conversation resource, as returned by the backend. */
export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /conversations` success body: the new conversation + its first turns. */
export interface StartConversationResult {
  conversation: Conversation;
  messages: ChatMessageDto[];
}

/** `POST /conversations/:id/messages` success body: the new turns, in order. */
export interface SendMessageResult {
  messages: ChatMessageDto[];
}
