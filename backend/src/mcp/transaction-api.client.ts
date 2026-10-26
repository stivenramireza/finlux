import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TransactionCurrency,
  TransactionType,
} from '../transactions/entities/transaction.entity.js';

/**
 * Transaction fields as returned by the transaction HTTP API. `amount` is a
 * decimal string end to end (never a float), mirroring the entity contract.
 */
export interface TransactionDto {
  id: string;
  userId: string;
  amount: string;
  type: TransactionType;
  currency: TransactionCurrency;
  date: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body accepted by `POST`/`PUT /transactions`. `amount` stays a decimal string. */
export interface WriteTransactionBody {
  amount: string;
  type: TransactionType;
  currency: TransactionCurrency;
  date: string;
  description?: string | null;
}

/** Validated query filters for `GET /transactions`. */
export interface ListTransactionsFilter {
  type?: TransactionType;
  dateFrom?: string;
  dateTo?: string;
}

/** Kinds of non-success outcome the tools can reason about without leaking internals. */
export type TransactionApiErrorKind =
  | 'not-found' // 404 → the (owned) resource does not exist
  | 'invalid-field' // 400 → a field failed server-side validation
  | 'service-unavailable'; // 401 / 5xx / transport → upstream problem

/**
 * A tool-level error carrying only a safe, model-facing kind/message. It never
 * contains the caller token, request bodies, amounts, or descriptions.
 */
export class TransactionApiError extends Error {
  constructor(
    readonly kind: TransactionApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'TransactionApiError';
  }
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Layer 3 host allowlist predicate: a credentialed request may only target the
 * exact configured origin. Exported for direct testing.
 */
export function isAllowedOrigin(requestUrl: URL, baseUrl: URL): boolean {
  return requestUrl.origin === baseUrl.origin;
}

/**
 * HTTP client for the transaction REST API (`transaction-http-api`). The agent's
 * MCP transaction tools are the ONLY callers; the agent has no direct database
 * access to transactions.
 *
 * ## Token-handling security — Layer 3 (anti confused-deputy)
 * - Every URL is built from the configured `TRANSACTION_API_BASE_URL`
 *   (`ConfigService`) plus **hard-coded path templates** and **validated**
 *   params (uuid for `:id`, enums for `type`/`currency`, `YYYY-MM-DD` dates) —
 *   never from model-supplied text concatenated into a host/path.
 * - Before attaching the caller's `Authorization: Bearer` header, the resolved
 *   request origin is asserted equal to the configured base URL's origin (a
 *   host allowlist of exactly one origin). A mismatch throws BEFORE any request
 *   is sent, so a bug or poisoned value can never ship the caller's token to a
 *   different host.
 *
 * The caller token and request bodies (amounts, descriptions) are never logged.
 */
@Injectable()
export class TransactionApiClient {
  private readonly logger = new Logger(TransactionApiClient.name);
  private readonly baseUrl: URL;

  constructor(configService: ConfigService) {
    const configured =
      configService.get<string>('TRANSACTION_API_BASE_URL') ??
      'http://localhost:3000';
    try {
      this.baseUrl = new URL(configured);
    } catch {
      throw new Error(
        'TRANSACTION_API_BASE_URL is not a valid URL. Define it in backend/.env (see .env.example).',
      );
    }
  }

  /** `GET /transactions` with optional, validated filters. */
  async list(
    filter: ListTransactionsFilter,
    token: string,
  ): Promise<TransactionDto[]> {
    const url = this.buildUrl('/transactions');
    if (filter.type !== undefined) {
      this.assertEnum(filter.type, TransactionType, 'type');
      url.searchParams.set('type', filter.type);
    }
    if (filter.dateFrom !== undefined) {
      this.assertCalendarDay(filter.dateFrom, 'dateFrom');
      url.searchParams.set('dateFrom', filter.dateFrom);
    }
    if (filter.dateTo !== undefined) {
      this.assertCalendarDay(filter.dateTo, 'dateTo');
      url.searchParams.set('dateTo', filter.dateTo);
    }
    return this.send<TransactionDto[]>('GET', url, token);
  }

  /** `GET /transactions/:id`. */
  async getOne(id: string, token: string): Promise<TransactionDto> {
    this.assertUuid(id);
    const url = this.buildUrl(`/transactions/${id}`);
    return this.send<TransactionDto>('GET', url, token);
  }

  /** `POST /transactions` — the only write-create path (confirmation-gated upstream). */
  async create(
    body: WriteTransactionBody,
    token: string,
  ): Promise<TransactionDto> {
    const url = this.buildUrl('/transactions');
    return this.send<TransactionDto>('POST', url, token, body);
  }

  /** `PUT /transactions/:id` (full replace per the REST contract). */
  async update(
    id: string,
    body: WriteTransactionBody,
    token: string,
  ): Promise<TransactionDto> {
    this.assertUuid(id);
    const url = this.buildUrl(`/transactions/${id}`);
    return this.send<TransactionDto>('PUT', url, token, body);
  }

  /** `DELETE /transactions/:id` → `204`. */
  async remove(id: string, token: string): Promise<void> {
    this.assertUuid(id);
    const url = this.buildUrl(`/transactions/${id}`);
    await this.send<void>('DELETE', url, token);
  }

  /** Builds a URL from the configured base + a hard-coded path (Layer 3). */
  protected buildUrl(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  private assertUuid(id: string): void {
    if (!UUID_V4_RE.test(id)) {
      throw new TransactionApiError('invalid-field', 'id must be a v4 uuid');
    }
  }

  private assertCalendarDay(value: string, field: string): void {
    if (!CALENDAR_DAY_RE.test(value)) {
      throw new TransactionApiError(
        'invalid-field',
        `${field} must be YYYY-MM-DD`,
      );
    }
  }

  private assertEnum<T extends Record<string, string>>(
    value: string,
    enumObject: T,
    field: string,
  ): void {
    if (!Object.values(enumObject).includes(value)) {
      throw new TransactionApiError('invalid-field', `invalid ${field}`);
    }
  }

  /**
   * Sends the request. Enforces the one-origin host allowlist BEFORE attaching
   * the bearer header, maps HTTP statuses to typed outcomes, and never logs the
   * token or the request body.
   */
  private async send<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: URL,
    token: string,
    body?: unknown,
  ): Promise<T> {
    // Layer 3 host allowlist: refuse if the resolved origin is not the
    // configured one. Checked before the Authorization header is ever set.
    if (!isAllowedOrigin(url, this.baseUrl)) {
      throw new TransactionApiError(
        'service-unavailable',
        'refusing to send credentialed request to a disallowed origin',
      );
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // Transport failure (offline, DNS, connection refused). No body/token logged.
      this.logger.error(`Transaction API request failed (${method})`);
      throw new TransactionApiError(
        'service-unavailable',
        'the transaction service is temporarily unavailable',
      );
    }

    return this.handleResponse<T>(method, response);
  }

  private async handleResponse<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    response: Response,
  ): Promise<T> {
    const { status } = response;

    if (status >= 200 && status < 300) {
      if (status === 204 || method === 'DELETE') {
        return undefined as T;
      }
      return (await response.json()) as T;
    }
    if (status === 404) {
      throw new TransactionApiError('not-found', 'transaction not found');
    }
    if (status === 400) {
      throw new TransactionApiError(
        'invalid-field',
        'one or more fields are invalid',
      );
    }
    // 401 (should not happen with a valid caller token), 5xx, and anything else
    // → generic unavailable; never surface upstream internals to the model.
    this.logger.error(`Transaction API returned status ${status} (${method})`);
    throw new TransactionApiError(
      'service-unavailable',
      'the transaction service is temporarily unavailable',
    );
  }
}
