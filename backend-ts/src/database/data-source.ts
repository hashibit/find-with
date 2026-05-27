import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './database.module';

// Used by TypeORM CLI for migrations
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
