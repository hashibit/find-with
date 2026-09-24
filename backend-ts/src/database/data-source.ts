import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

import { ALL_ENTITIES } from './entities/index.js';

// Used by TypeORM CLI for migrations
// Only load .env if DATABASE_URL is not already set (e.g., by E2E setup)
if (!process.env.DATABASE_URL) {
  config();
}

// tsx runs .ts files directly, no need for compiled .js paths
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
