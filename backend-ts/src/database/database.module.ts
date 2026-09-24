import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvancedConsoleLogger } from 'typeorm';
import { type AppConfig } from '../config/configuration.js';
import { DatabaseService } from './database.service.js';
import { ALL_ENTITIES } from './entities/index.js';

// Tests import ALL_ENTITIES from this module — keep the re-export in sync
// with the single source in ./entities/index.ts.
export { ALL_ENTITIES };

/**
 * TypeORM's default advanced-console logger with bytea parameters redacted:
 * encrypted ciphertext columns serialize as thousands of integers of noise
 * (`-- PARAMETERS: [{"type":"Buffer","data":[...]}]`), so each Buffer becomes
 * a length marker instead. Constructor takes the `logging` value, matching
 * how DataSource hands `options.logging` to loggers (DataSource.js).
 */
class RedactedParamLogger extends AdvancedConsoleLogger {
  protected override stringifyParams(parameters: unknown[]): string | unknown[] {
    return super.stringifyParams(
      parameters.map((p) => (Buffer.isBuffer(p) ? `[Buffer ${p.length}B]` : p)),
    );
  }
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const dbUrl = config.get('database', { infer: true })!.url;
        const isProduction = config.get('env', { infer: true }) === 'production';
        return {
          type: 'postgres',
          url: dbUrl,
          entities: ALL_ENTITIES,
          synchronize: false,
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          logging: !isProduction,
          logger: new RedactedParamLogger(!isProduction),
        };
      },
    }),
  ],
  providers: [DatabaseService],
  exports: [TypeOrmModule, DatabaseService],
})
export class DatabaseModule {}
