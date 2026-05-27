import { Column, Entity } from 'typeorm';
import { UserOwnedSingletonEntity } from '../base.entity';

@Entity('iam_settings')
export class IamSettings extends UserOwnedSingletonEntity {
  @Column({ type: 'varchar', length: 20, default: 'BALANCED' })
  density: string;

  @Column({ type: 'varchar', length: 10, default: 'en-US' })
  locale: string;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;
}
