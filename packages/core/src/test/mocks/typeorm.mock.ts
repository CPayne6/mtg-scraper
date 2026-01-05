import { Repository } from 'typeorm';

export class MockRepository<T = any> {
  private entities: T[] = [];

  find(options?: any): Promise<T[]> {
    return Promise.resolve(this.entities);
  }

  findOne(options?: any): Promise<T | null> {
    return Promise.resolve(this.entities[0] || null);
  }

  findOneBy(where: any): Promise<T | null> {
    return Promise.resolve(this.entities[0] || null);
  }

  save(entity: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entity)) {
      this.entities.push(...entity);
      return Promise.resolve(entity);
    }
    this.entities.push(entity);
    return Promise.resolve(entity);
  }

  create(entityLike: Partial<T>): T {
    return entityLike as T;
  }

  update(criteria: any, partialEntity: any): Promise<any> {
    return Promise.resolve({ affected: 1 });
  }

  delete(criteria: any): Promise<any> {
    return Promise.resolve({ affected: 1 });
  }

  remove(entity: T | T[]): Promise<T | T[]> {
    return Promise.resolve(entity);
  }

  count(options?: any): Promise<number> {
    return Promise.resolve(this.entities.length);
  }

  setEntities(entities: T[]): void {
    this.entities = entities;
  }

  getEntities(): T[] {
    return this.entities;
  }

  clear(): void {
    this.entities = [];
  }
}

export const createMockRepository = <T = any>(): MockRepository<T> => new MockRepository<T>();

export type MockType<T> = {
  [P in keyof T]?: ReturnType<typeof vi.fn>;
};

export const createMockTypeOrmRepository = <T = any>(): MockType<Repository<T>> => ({
  find: vi.fn(),
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  remove: vi.fn(),
  count: vi.fn(),
});
