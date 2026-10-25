import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { TransactionsService } from './transactions.service.js';
import type { Transaction } from './entities/transaction.entity.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import type { UpdateTransactionDto } from './dto/update-transaction.dto.js';

/**
 * Authenticated REST surface for the current user's transactions. Every handler
 * is scoped to the caller's `userId` (resolved from the JWT via
 * `@CurrentUser('userId')`, never from the body/query/path) and routes all
 * access through the user-scoped `TransactionsService` — no direct repository
 * or raw queries. Request bodies/params are validated by the global
 * `ValidationPipe`; the `:id` param is validated as a v4 uuid.
 */
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateTransactionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Transaction> {
    const transaction = await this.transactionsService.create(userId, dto);
    res.location(`/transactions/${transaction.id}`);
    return transaction;
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<Transaction[]> {
    return this.transactionsService.findAll(userId, query.toFilter());
  }

  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Transaction> {
    return this.transactionsService.findOneOrFail(userId, id);
  }

  @Put(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<Transaction> {
    // PUT is a full replace (design Decision 2): every mutable field is sent,
    // and an absent `description` clears the field (stored as null) rather than
    // leaving it unchanged.
    const replacement: UpdateTransactionDto = {
      amount: dto.amount,
      type: dto.type,
      currency: dto.currency,
      date: dto.date,
      description: dto.description ?? null,
    };
    return this.transactionsService.update(userId, id, replacement);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.transactionsService.remove(userId, id);
  }
}
