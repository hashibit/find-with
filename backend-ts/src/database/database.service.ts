import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * DatabaseService provides database connectivity operations.
 * Used for health/ready checks and database-dependent operations.
 */
@Injectable()
export class DatabaseService {
  constructor(private readonly dataSource: DataSource) {}

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
