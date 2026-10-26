/**
 * Typed chat API over the shared `AuthApiClient.authedFetch` (Design:
 * Decisions 2, 3). A pure wrapper constructed from an injected client, so it is
 * trivially unit-testable with a fake `authedFetch`.
 *
 * It reuses the auth client's token + global `401` handling verbatim: a `401`
 * is NOT mapped here — `authedFetch` has already invoked the global
 * `onUnauthorized` (clearing the session so the gate shows the auth screen), so
 * the caller treats the `401` response as an aborted turn (no agent bubble).
 *
 * Security: paths are built from hard-coded templates + the uuid id only; the
 * body is `{ message, title? }` and never carries a user/ownership hint
 * (Req 4.2). Never logs the token, message bodies, or agent content (Req 4.4).
 */
import type {
  ChatMessageDto,
  Conversation,
  SendMessageResult,
  StartConversationResult,
} from './types';

/** Minimal shape of the shared client this module depends on (for testability). */
export interface AuthedFetchClient {
  authedFetch(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * Typed chat error surfaced to the UI. `401` is intentionally absent: it is
 * handled globally by `authedFetch` before we ever inspect the response.
 * - `validation`  → 400 (empty/oversized/unknown field)
 * - `not-found`   → 404 (conversation gone / not owned)
 * - `unavailable` → 502 / 503 (model/provider/downstream failure)
 * - `network`     → transport failure (offline/DNS/CORS/timeout)
 * - `unknown`     → anything else
 */
export type ChatError =
  | { kind: 'validation' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }
  | { kind: 'network' }
  | { kind: 'aborted-unauthorized' }
  | { kind: 'unknown'; status?: number };

/** Discriminated result wrapper returned by chat calls. */
export type ChatResult<T> =
  { ok: true; data: T } | { ok: false; error: ChatError };

export class ChatApi {
  private readonly client: AuthedFetchClient;

  constructor(client: AuthedFetchClient) {
    this.client = client;
  }

  /**
   * `POST /conversations` → 201 `{ conversation, messages }`.
   * Starts a conversation with a first user message.
   */
  async startConversation(
    message: string,
    title?: string,
  ): Promise<ChatResult<StartConversationResult>> {
    const body: { message: string; title?: string } = { message };
    if (title && title.trim().length > 0) {
      body.title = title.trim();
    }

    return this.request<StartConversationResult>(
      '/conversations',
      { method: 'POST', body: JSON.stringify(body) },
      (data) =>
        isConversation((data as StartConversationResult)?.conversation) &&
        Array.isArray((data as StartConversationResult)?.messages),
    );
  }

  /**
   * `POST /conversations/:id/messages` → 201 `{ messages }`.
   * Continues an existing conversation the caller owns.
   */
  async sendMessage(
    conversationId: string,
    message: string,
  ): Promise<ChatResult<SendMessageResult>> {
    return this.request<SendMessageResult>(
      `/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ message }) },
      (data) => Array.isArray((data as SendMessageResult)?.messages),
    );
  }

  /**
   * `GET /conversations` → 200 `Conversation[]`.
   * Defined for a later history spec; intentionally NOT wired into the UI.
   */
  async listConversations(): Promise<ChatResult<Conversation[]>> {
    return this.request<Conversation[]>(
      '/conversations',
      { method: 'GET' },
      (data) => Array.isArray(data),
    );
  }

  /**
   * `GET /conversations/:id/messages` → 200 `Message[]`.
   * Defined for a later history spec; intentionally NOT wired into the UI.
   */
  async listMessages(
    conversationId: string,
  ): Promise<ChatResult<ChatMessageDto[]>> {
    return this.request<ChatMessageDto[]>(
      `/conversations/${conversationId}/messages`,
      { method: 'GET' },
      (data) => Array.isArray(data),
    );
  }

  /**
   * Shared request/mapping path. Performs the `authedFetch`, maps status codes
   * to a typed outcome, and validates the success body defensively.
   */
  private async request<T>(
    path: string,
    init: RequestInit,
    isValid: (data: unknown) => boolean,
  ): Promise<ChatResult<T>> {
    let response: Response;
    try {
      response = await this.client.authedFetch(path, init);
    } catch {
      // Transport failure (offline/DNS/CORS/timeout).
      return { ok: false, error: { kind: 'network' } };
    }

    if (response.ok) {
      const data = await this.safeJson(response);
      if (data === null || !isValid(data)) {
        return {
          ok: false,
          error: { kind: 'unknown', status: response.status },
        };
      }
      return { ok: true, data: data as T };
    }

    switch (response.status) {
      case 401:
        // Already handled globally by authedFetch's onUnauthorized; the turn is
        // aborted and the gate will show the auth screen (Req 4.3).
        return { ok: false, error: { kind: 'aborted-unauthorized' } };
      case 400:
        return { ok: false, error: { kind: 'validation' } };
      case 404:
        return { ok: false, error: { kind: 'not-found' } };
      case 502:
      case 503:
        return { ok: false, error: { kind: 'unavailable' } };
      default:
        return {
          ok: false,
          error: { kind: 'unknown', status: response.status },
        };
    }
  }

  /** Parses JSON defensively; returns null on empty/invalid bodies. */
  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}

function isConversation(value: unknown): value is Conversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Conversation).id === 'string'
  );
}
