/**
 * AdminJS TypeORM adapter for NestJS DataMapper pattern.
 *
 * @adminjs/typeorm v5 requires entities to extend TypeORM's own BaseEntity
 * (ActiveRecord) so it can call Model.getRepository(), Model.find(), etc.
 * Our entities use DataMapper with injected repositories.
 *
 * This module builds a per-entity facade class that satisfies the ActiveRecord
 * interface expected by @adminjs/typeorm's Resource, using the injected
 * repository under the hood. The facade is then passed directly to the
 * standard Resource, keeping full compatibility with AdminJS internals
 * (Property, filters, etc.).
 *
 * Usage:
 *   import { wrapRepo } from './repository-resource.js';
 *   resources: [
 *     { resource: wrapRepo(IamUser, userRepo), options: { ... } }
 *   ]
 */
import type { Repository, ObjectLiteral, FindManyOptions } from 'typeorm';

/**
 * Build a facade class that makes a TypeORM entity "look like" an
 * ActiveRecord model to @adminjs/typeorm's Resource adapter.
 */
export function wrapRepo<T extends ObjectLiteral>(
  entity: new () => T,
  repository: Repository<T>,
): new () => T {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  const facade = class Facade extends (entity as new () => ObjectLiteral) {
    // instance method required by Resource.delete via instance.remove()
    async remove(): Promise<this> {
      await repository.remove(this as unknown as T);
      return this;
    }
    // instance method required by Resource.validateAndSave via instance.save()
    async save(): Promise<this> {
      await repository.save(this as unknown as T);
      return this;
    }
  };

  // Static methods used by @adminjs/typeorm Resource
  Object.defineProperty(facade, 'name', { value: entity.name, configurable: true });

  (facade as unknown as Record<string, unknown>)['getRepository'] = () => repository;
  (facade as unknown as Record<string, unknown>)['count'] = (opts?: FindManyOptions<T>) =>
    repository.count(opts);
  (facade as unknown as Record<string, unknown>)['find'] = (opts?: FindManyOptions<T>) =>
    repository.find(opts);
  (facade as unknown as Record<string, unknown>)['findOneBy'] = (where: Parameters<Repository<T>['findOneBy']>[0]) =>
    repository.findOneBy(where);
  (facade as unknown as Record<string, unknown>)['findBy'] = (where: Parameters<Repository<T>['findBy']>[0]) =>
    repository.findBy(where);
  (facade as unknown as Record<string, unknown>)['create'] = (plain?: Partial<T>) =>
    repository.create(plain as T);

  return facade as unknown as new () => T;
}
