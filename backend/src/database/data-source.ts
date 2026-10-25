import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Transaction } from '../transactions/entities/transaction.entity.js';
import { InitialSchema1730000000000 } from './migrations/1730000000000-InitialSchema.js';

// Load variables from `backend/.env` for the standalone TypeORM CLI, which runs
// outside the Nest application (so ConfigModule is not available here).
loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Define it in backend/.env (see .env.example).',
  );
}

/**
 * Options shared by the Nest TypeOrmModule and the standalone CLI DataSource.
 * Entities and migrations are referenced as explicit imports (not globs) so
 * resolution is deterministic under ESM.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl,
  synchronize: false,
  migrationsRun: false,
  entities: [User, Transaction],
  migrations: [InitialSchema1730000000000],
  migrationsTableName: 'migrations',
};

/** DataSource consumed by the TypeORM CLI for migration commands. */
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
