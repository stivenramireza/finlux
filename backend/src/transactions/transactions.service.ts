import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import { Transaction } from './entities/transaction.entity.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { TransactionFilter } from './dto/transaction-filter.dto.js';

/**
 * User-scoped, soft-delete-aware transaction access. Every method takes
 * `userId` and applies it in the WHERE clause. On create/update, the referenced
 * account and category are validated to belong to the same user (an account
 * must be owned; a category must be owned or a global seed).
 */
@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
  ) {}

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    await this.assertAccountOwned(userId, dto.accountId);
    if (dto.categoryId) {
      await this.assertCategoryVisible(userId, dto.categoryId);
    }

    const transaction = this.transactions.create({
      userId,
      accountId: dto.accountId,
      categoryId: dto.categoryId ?? null,
      amount: dto.amount,
      currency: dto.currency,
      type: dto.type,
      date: dto.date,
      description: dto.description ?? null,
    });
    return this.transactions.save(transaction);
  }

  /** Lists the user's (non-soft-deleted) transactions, newest day first. */
  findAll(userId: string, filter?: TransactionFilter): Promise<Transaction[]> {
    const where: FindOptionsWhere<Transaction> = { userId };

    if (filter?.accountId) {
      where.accountId = filter.accountId;
    }
    if (filter?.categoryId) {
      where.categoryId = filter.categoryId;
    }
    if (filter?.type) {
      where.type = filter.type as Transaction['type'];
    }
    if (filter?.dateFrom && filter?.dateTo) {
      where.date = Between(filter.dateFrom, filter.dateTo);
    } else if (filter?.dateFrom) {
      where.date = MoreThanOrEqual(filter.dateFrom);
    } else if (filter?.dateTo) {
      where.date = LessThanOrEqual(filter.dateTo);
    }

    // The repository excludes soft-deleted rows (deletedAt) by default.
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

    if (dto.accountId !== undefined) {
      await this.assertAccountOwned(userId, dto.accountId);
      transaction.accountId = dto.accountId;
    }
    if (dto.categoryId !== undefined) {
      if (dto.categoryId !== null) {
        await this.assertCategoryVisible(userId, dto.categoryId);
      }
      transaction.categoryId = dto.categoryId;
    }
    if (dto.amount !== undefined) {
      transaction.amount = dto.amount;
    }
    if (dto.currency !== undefined) {
      transaction.currency = dto.currency;
    }
    if (dto.type !== undefined) {
      transaction.type = dto.type;
    }
    if (dto.date !== undefined) {
      transaction.date = dto.date;
    }
    if (dto.description !== undefined) {
      transaction.description = dto.description;
    }

    return this.transactions.save(transaction);
  }

  /** Soft-deletes (sets `deletedAt`) a transaction the caller owns. */
  async softDelete(userId: string, transactionId: string): Promise<void> {
    // Scope first so we never soft-delete another user's row.
    await this.findOneOrFail(userId, transactionId);
    await this.transactions.softDelete({ id: transactionId, userId });
  }

  private async assertAccountOwned(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accounts.findOne(userId, accountId);
    if (!account) {
      throw new BadRequestException(
        'Account does not exist or does not belong to the user',
      );
    }
  }

  private async assertCategoryVisible(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    // A category is usable if it is the user's own or a global seed.
    const category = await this.categories.findOne(userId, categoryId);
    if (!category) {
      throw new BadRequestException(
        'Category does not exist or is not available to the user',
      );
    }
  }
}
