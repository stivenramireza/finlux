import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import { Transaction } from './entities/transaction.entity.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { TransactionFilter } from './dto/transaction-filter.dto.js';

/**
 * User-scoped transaction access. Every method takes `userId` and applies it in
 * the WHERE clause, so one user can never read or mutate another user's rows.
 */
@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  create(userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    const transaction = this.transactions.create({
      userId,
      amount: dto.amount,
      type: dto.type,
      currency: dto.currency,
      date: dto.date,
      description: dto.description ?? null,
    });
    return this.transactions.save(transaction);
  }

  /** Lists the user's transactions, newest day first. */
  findAll(userId: string, filter?: TransactionFilter): Promise<Transaction[]> {
    const where: FindOptionsWhere<Transaction> = { userId };

    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.dateFrom && filter?.dateTo) {
      where.date = Between(filter.dateFrom, filter.dateTo);
    } else if (filter?.dateFrom) {
      where.date = MoreThanOrEqual(filter.dateFrom);
    } else if (filter?.dateTo) {
      where.date = LessThanOrEqual(filter.dateTo);
    }

    return this.transactions.find({
      where,
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  findOne(userId: string, transactionId: string): Promise<Transaction | null> {
    return this.transactions.findOne({
      where: { id: transactionId, userId },
    });
  }

  async findOneOrFail(
    userId: string,
    transactionId: string,
  ): Promise<Transaction> {
    const transaction = await this.findOne(userId, transactionId);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(
    userId: string,
    transactionId: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const transaction = await this.findOneOrFail(userId, transactionId);

    if (dto.amount !== undefined) {
      transaction.amount = dto.amount;
    }
    if (dto.type !== undefined) {
      transaction.type = dto.type;
    }
    if (dto.currency !== undefined) {
      transaction.currency = dto.currency;
    }
    if (dto.date !== undefined) {
      transaction.date = dto.date;
    }
    if (dto.description !== undefined) {
      transaction.description = dto.description;
    }

    return this.transactions.save(transaction);
  }

  /** Permanently deletes a transaction the caller owns. */
  async remove(userId: string, transactionId: string): Promise<void> {
    // Scope first so we never delete another user's row.
    await this.findOneOrFail(userId, transactionId);
    await this.transactions.delete({ id: transactionId, userId });
  }
}
