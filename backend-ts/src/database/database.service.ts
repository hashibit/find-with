import { Injectable, OnModuleInit } from '@nestjs/common';
import { BaseEntity, DataSource } from 'typeorm';

/**
 * DatabaseService provides database connectivity operations.
 * Used for health/ready checks and database-dependent operations.
 */
@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Wire the initialized DataSource into TypeORM's BaseEntity so that
   * entity classes (which extend our custom BaseEntity → TypeORM BaseEntity)
   * can call getRepository(), enabling the @adminjs/typeorm adapter's
   * isAdapterFor check and Active Record query methods.
   */
  onModuleInit(): void {
    BaseEntity.useDataSource(this.dataSource);
  }

  /**
   * Test database connection.
   * Throws if connection is unavailable.
   */
  async testConnection(): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /**
   * Get the underlying data source.
   * Used for direct repository access when needed.
   */
  getDataSource(): DataSource {
    return this.dataSource;
  }
}
