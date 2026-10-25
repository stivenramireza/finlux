import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

/**
 * User-scoped account access. Every method takes `userId` and applies it in the
 * WHERE clause, so one user can never read or mutate another user's accounts.
 */
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}

  create(userId: string, dto: CreateAccountDto): Promise<Account> {
    const account = this.accounts.create({
      userId,
      name: dto.name,
      type: dto.type ?? null,
      currency: dto.currency ?? null,
    });
    return this.accounts.save(account);
  }

  findAll(userId: string): Promise<Account[]> {
    return this.accounts.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  findOne(userId: string, accountId: string): Promise<Account | null> {
    return this.accounts.findOne({ where: { id: accountId, userId } });
  }

  async findOneOrFail(userId: string, accountId: string): Promise<Account> {
    const account = await this.findOne(userId, accountId);
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  async update(
    userId: string,
    accountId: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findOneOrFail(userId, accountId);
    if (dto.name !== undefined) {
      account.name = dto.name;
    }
    if (dto.type !== undefined) {
      account.type = dto.type;
    }
    if (dto.currency !== undefined) {
      account.currency = dto.currency;
    }
    return this.accounts.save(account);
  }

  /**
   * Hard-deletes a user's account. The DB FK uses ON DELETE RESTRICT, so an
   * account that still has transactions cannot be removed; we surface that as a
   * conflict rather than a raw DB error.
   */
  async remove(userId: string, accountId: string): Promise<void> {
    const account = await this.findOneOrFail(userId, accountId);
    try {
      await this.accounts.remove(account);
    } catch (error: unknown) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Account has transactions and cannot be deleted',
        );
      }
      throw error;
    }
  }

  private isForeignKeyViolation(error: unknown): boolean {
    // PostgreSQL error code 23503 = foreign_key_violation.
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23503'
    );
  }
}
