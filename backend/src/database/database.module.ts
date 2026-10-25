import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { Account } from '../accounts/entities/account.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Transaction } from '../transactions/entities/transaction.entity.js';
import { InitialSchema1730000000000 } from './migrations/1730000000000-InitialSchema.js';
import { SeedCategories1730000000001 } from './migrations/1730000000001-SeedCategories.js';

/**
 * Wires TypeORM into Nest. Connection config is read from the environment via
 * ConfigService (`DATABASE_URL`, by key name only — never hard-coded).
 * `synchronize` and `migrationsRun` are disabled: the schema is managed solely
 * through versioned migrations.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error(
            'DATABASE_URL is not set. Define it in backend/.env (see .env.example).',
          );
        }
        return {
          type: 'postgres' as const,
          url,
          synchronize: false,
          migrationsRun: false,
          autoLoadEntities: false,
          entities: [User, Account, Category, Transaction],
          migrations: [InitialSchema1730000000000, SeedCategories1730000000001],
          migrationsTableName: 'migrations',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
