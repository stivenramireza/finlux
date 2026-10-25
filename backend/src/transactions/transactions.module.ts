import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity.js';
import { TransactionsService } from './transactions.service.js';
import { TransactionsController } from './transactions.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
