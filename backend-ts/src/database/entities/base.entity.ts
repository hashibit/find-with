import { BaseEntity as TypeOrmBaseEntity, BeforeInsert, Column, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

/**
 * Project base entity.
 * Extends TypeORM's BaseEntity so that:
 *  - The @adminjs/typeorm adapter can call getRepository() on entity classes
 *    (required for its isAdapterFor + CRUD operations).
 *  - Active-record convenience methods (save, remove, reload) are available
 *    alongside the standard data-mapper repository pattern.
 *
 * DatabaseService.onModuleInit calls BaseEntity.useDataSource(dataSource) to
 * activate the shared connection before any entity methods are used.
 */
export abstract class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  id: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()', onUpdate: 'NOW()' })
  updatedAt: Date;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) {
      this.id = ulid();
    }
  }
}

/** For entities whose PK is a user_id FK (1:1 with iam_users). */
export abstract class UserOwnedSingletonEntity extends TypeOrmBaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  userId: string;
}
