import { BeforeInsert, Column, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

export abstract class BaseEntity {
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
export abstract class UserOwnedSingletonEntity {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  userId: string;
}
