import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { TransactionsController } from './transactions.controller.js';
import type { TransactionsService } from './transactions.service.js';
import {
  Transaction,
  TransactionCurrency,
  TransactionType,
} from './entities/transaction.entity.js';
import type { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';

const USER_ID = 'user-1';
const TX_ID = '11111111-1111-4111-8111-111111111111';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: TX_ID,
    userId: USER_ID,
    amount: '20.0000',
    type: TransactionType.EXPENSE,
    currency: TransactionCurrency.USD,
    date: '2025-01-15',
    description: 'Lunch',
    createdAt: new Date('2025-01-15T12:00:00.000Z'),
    updatedAt: new Date('2025-01-15T12:00:00.000Z'),
    user: undefined as never,
    ...overrides,
  };
}

function makeService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    findOneOrFail: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
    controller = new TransactionsController(
      service as unknown as TransactionsService,
    );
  });

  describe('create', () => {
    const dto: CreateTransactionDto = {
      amount: '20.0000',
      type: TransactionType.EXPENSE,
      currency: TransactionCurrency.USD,
      date: '2025-01-15',
      description: 'Lunch',
    };

    it('forwards the userId, returns the created tx, and sets the Location header', async () => {
      const created = makeTransaction();
      service.create.mockResolvedValue(created);
      const location = vi.fn();
      const res = { location } as unknown as Response;

      const result = await controller.create(USER_ID, dto, res);

      expect(service.create).toHaveBeenCalledWith(USER_ID, dto);
      expect(result).toBe(created);
      expect(location).toHaveBeenCalledWith(`/transactions/${TX_ID}`);
    });
  });

  describe('findAll', () => {
    it('forwards the userId and the mapped filter, and returns the array', async () => {
      const rows = [makeTransaction()];
      service.findAll.mockResolvedValue(rows);
      const query = new ListTransactionsQueryDto();
      query.type = TransactionType.EXPENSE;
      query.dateFrom = '2025-01-01';
      query.dateTo = '2025-01-31';

      const result = await controller.findAll(USER_ID, query);

      expect(service.findAll).toHaveBeenCalledWith(USER_ID, {
        type: TransactionType.EXPENSE,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      });
      expect(result).toBe(rows);
    });

    it('returns an empty array when the user has no transactions', async () => {
      service.findAll.mockResolvedValue([]);
      const result = await controller.findAll(
        USER_ID,
        new ListTransactionsQueryDto(),
      );
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('forwards the userId and id and returns the tx', async () => {
      const tx = makeTransaction();
      service.findOneOrFail.mockResolvedValue(tx);

      const result = await controller.findOne(USER_ID, TX_ID);

      expect(service.findOneOrFail).toHaveBeenCalledWith(USER_ID, TX_ID);
      expect(result).toBe(tx);
    });

    it('propagates NotFoundException from the service', async () => {
      service.findOneOrFail.mockRejectedValue(
        new NotFoundException('Transaction not found'),
      );
      await expect(controller.findOne(USER_ID, TX_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const dto: CreateTransactionDto = {
      amount: '30.5000',
      type: TransactionType.INCOME,
      currency: TransactionCurrency.COP,
      date: '2025-02-01',
      description: 'Refund',
    };

    it('passes all mutable fields through as a full replace', async () => {
      const updated = makeTransaction({ amount: '30.5000' });
      service.update.mockResolvedValue(updated);

      const result = await controller.update(USER_ID, TX_ID, dto);

      expect(service.update).toHaveBeenCalledWith(USER_ID, TX_ID, {
        amount: '30.5000',
        type: TransactionType.INCOME,
        currency: TransactionCurrency.COP,
        date: '2025-02-01',
        description: 'Refund',
      });
      expect(result).toBe(updated);
    });

    it('normalizes an absent description to null (full replace clears it)', async () => {
      service.update.mockResolvedValue(makeTransaction());
      const withoutDescription: CreateTransactionDto = {
        amount: '30.5000',
        type: TransactionType.INCOME,
        currency: TransactionCurrency.COP,
        date: '2025-02-01',
      };

      await controller.update(USER_ID, TX_ID, withoutDescription);

      expect(service.update).toHaveBeenCalledWith(
        USER_ID,
        TX_ID,
        expect.objectContaining({ description: null }),
      );
    });

    it('propagates NotFoundException from the service', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('Transaction not found'),
      );
      await expect(
        controller.update(USER_ID, TX_ID, dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('forwards the userId and id and resolves void', async () => {
      service.remove.mockResolvedValue(undefined);

      await expect(controller.remove(USER_ID, TX_ID)).resolves.toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(USER_ID, TX_ID);
    });

    it('propagates NotFoundException from the service', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Transaction not found'),
      );
      await expect(controller.remove(USER_ID, TX_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
