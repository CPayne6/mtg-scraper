# @mtg-scraper/core

Core infrastructure and domain logic package for MTG Scraper backend services.

## Overview

The Core package provides shared infrastructure modules that are used by all backend services (API, Scheduler, Scraper). It encapsulates database configuration, queue management, caching, and store entity logic.

### Purpose

- **Code Reusability**: Avoid duplicating infrastructure code across services
- **Consistency**: Ensure all services use the same database/queue configuration
- **Maintainability**: Centralize infrastructure changes in one place
- **Type Safety**: Shared TypeORM entities and service interfaces

## Modules

### Database Module

Provides TypeORM database configuration factory.

**Exports**
- `getDatabaseConfig()` - Returns TypeORM configuration based on environment

**Usage**
```typescript
import { getDatabaseConfig } from '@mtg-scraper/core';

TypeOrmModule.forRootAsync({
  useFactory: () => getDatabaseConfig()
});
```

**Configuration**
```typescript
{
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [Store],
  synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
  logging: process.env.NODE_ENV === 'development'
}
```

### Store Module

Manages store entities and provides CRUD operations with in-memory caching.

**Exports**
- `StoreModule` - NestJS module
- `StoreService` - Service for store operations
- `Store` - TypeORM entity

**Usage**
```typescript
import { StoreModule, StoreService } from '@mtg-scraper/core';

@Module({
  imports: [StoreModule]
})
class AppModule {}

// In service
constructor(private storeService: StoreService) {}

async getStores() {
  return this.storeService.getActiveStores();
}
```

**Store Entity**
```typescript
@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column()
  displayName: string;

  @Column()
  baseUrl: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  scraperType: string;  // 'f2f' | '401' | 'hobbies' | 'binderpos'

  @Column('jsonb', { nullable: true })
  scraperConfig?: {
    searchPath?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**StoreService Methods**
- `getActiveStores()` - Get all active stores (cached for 1 hour)
- `getStoreByName(name: string)` - Get specific store by name
- `getAllStores()` - Get all stores (including inactive)
- `updateStore(id: number, data: Partial<Store>)` - Update store
- `refreshCache()` - Manually refresh the in-memory cache

**Caching**
- Stores are cached in memory for 1 hour
- Cache auto-refreshes on expiration
- Reduces database queries
- Improves performance for frequent lookups

### Queue Module

Provides BullMQ queue client for enqueueing jobs.

**Exports**
- `QueueModule` - NestJS module
- `QueueService` - Service for queue operations

**Usage**
```typescript
import { QueueModule, QueueService } from '@mtg-scraper/core';
import { QUEUE_NAMES, JOB_NAMES } from '@mtg-scraper/shared';

@Module({
  imports: [QueueModule]
})
class AppModule {}

// In service
constructor(private queueService: QueueService) {}

async enqueueCardScrape(cardName: string) {
  await this.queueService.enqueue(QUEUE_NAMES.CARD_SCRAPE, {
    jobName: JOB_NAMES.SCRAPE_CARD,
    data: { cardName },
    opts: { priority: 10 }
  });
}
```

**QueueService Methods**
- `enqueue(queueName, { jobName, data, opts })` - Add job to queue
- `getQueue(queueName)` - Get BullMQ Queue instance
- `getJobCounts(queueName)` - Get queue statistics

**Queue Configuration**
```typescript
{
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 500       // Keep last 500 failed jobs
  }
}
```

### Cache Module

Provides Redis caching with pub/sub support for real-time notifications.

**Exports**
- `CacheModule` - NestJS module
- `CacheService` - Service for cache operations

**Usage**
```typescript
import { CacheModule, CacheService } from '@mtg-scraper/core';

@Module({
  imports: [CacheModule]
})
class AppModule {}

// In service
constructor(private cacheService: CacheService) {}

async cacheResults(cardName: string, data: any) {
  await this.cacheService.set(`card:${cardName}`, data, 86400);
}

async getResults(cardName: string) {
  return this.cacheService.get(`card:${cardName}`);
}
```

**CacheService Methods**
- `get(key)` - Get value from cache
- `set(key, value, ttl)` - Set value with TTL (seconds)
- `del(key)` - Delete key
- `setNX(key, value, ttl)` - Set if not exists (distributed lock)
- `publish(channel, message)` - Publish to pub/sub channel
- `subscribe(channel, callback)` - Subscribe to pub/sub channel
- `waitForKey(key, timeout)` - Wait for key to exist via pub/sub
- `exists(key)` - Check if key exists

**Pub/Sub for Real-Time Notifications**

The cache service uses Redis keyspace notifications for real-time updates:

```typescript
// API Service - Wait for scraper to complete
const result = await this.cacheService.waitForKey(
  `card:${cardName}`,
  60000  // 60 second timeout
);

// Scraper Service - Notify when done
await this.cacheService.set(`card:${cardName}`, results, 86400);
// Keyspace notification automatically sent
```

**How it Works**
1. Redis keyspace notifications enabled (`notify-keyspace-events AKE`)
2. CacheService subscribes to `__keyspace@0__:*` pattern
3. When a key is SET, notification is published
4. Waiting clients receive notification immediately

## Architecture

```
┌────────────────────────────────────────┐
│       @mtg-scraper/core                │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  Database                        │ │
│  │  - getDatabaseConfig()           │ │
│  │  - TypeORM configuration         │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  StoreModule                     │ │
│  │  - Store entity                  │ │
│  │  - StoreService (CRUD + cache)   │ │
│  │  - In-memory cache (1h TTL)      │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  QueueModule                     │ │
│  │  - QueueService                  │ │
│  │  - BullMQ client                 │ │
│  │  - Job enqueueing                │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  CacheModule                     │ │
│  │  - CacheService                  │ │
│  │  - Redis client (ioredis)        │ │
│  │  - Pub/sub notifications         │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Installation

The core package is part of the pnpm workspace and is automatically linked.

```bash
# From root
pnpm install

# Build core package
pnpm --filter @mtg-scraper/core build
```

## Dependencies

**NestJS**
- `@nestjs/common` - Common utilities
- `@nestjs/config` - Configuration module
- `@nestjs/typeorm` - TypeORM integration
- `@nestjs/bull` - BullMQ integration

**Database**
- `typeorm` - ORM framework
- `pg` - PostgreSQL driver

**Queue & Cache**
- `bullmq` - Job queue
- `ioredis` - Redis client

**Workspace**
- `@mtg-scraper/shared` - Shared types

## Development

### Building

```bash
# Build package
pnpm build

# Watch mode
pnpm watch

# Clean dist
pnpm clean
```

### Testing

The core package includes test utilities:

```typescript
import { createTestStoreService } from '@mtg-scraper/core/test';

describe('MyService', () => {
  it('should work', async () => {
    const storeService = createTestStoreService();
    // Test your service
  });
});
```

**Test Utilities** (`src/test/`)
- Mock service factories
- Test data fixtures
- Helper functions for testing

## Usage in Services

### API Service

```typescript
import {
  QueueModule,
  CacheModule,
  StoreModule
} from '@mtg-scraper/core';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => getDatabaseConfig()
    }),
    QueueModule,
    CacheModule,
    StoreModule,
    // ... other modules
  ]
})
export class AppModule {}
```

### Scheduler Service

```typescript
import { QueueModule } from '@mtg-scraper/core';

@Module({
  imports: [
    ConfigModule.forRoot(),
    QueueModule,  // Only needs queue, no database
    // ... other modules
  ]
})
export class AppModule {}
```

### Scraper Service

```typescript
import {
  QueueModule,
  CacheModule,
  StoreModule,
  getDatabaseConfig
} from '@mtg-scraper/core';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => getDatabaseConfig()
    }),
    QueueModule,    // Process jobs
    CacheModule,    // Cache results
    StoreModule,    // Get store configs
    // ... other modules
  ]
})
export class AppModule {}
```

## Environment Variables

Required environment variables for core modules:

### Database
```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mtg_scraper
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_SYNCHRONIZE=false
```

### Redis (Queue & Cache)
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Design Decisions

### Why In-Memory Caching for Stores?

Store configurations rarely change, so caching them in memory:
- Reduces database queries (1 query per hour vs. every request)
- Improves performance
- Simplifies code (no Redis needed for stores)

### Why Separate Queue and Cache Modules?

While both use Redis:
- **Queue**: Uses BullMQ-specific features (job retry, priorities)
- **Cache**: Uses generic Redis operations (get/set/pub/sub)
- Separation allows for different Redis instances if needed
- Clear separation of concerns

### Why TypeORM Entities in Core?

- Single source of truth for database schema
- Ensures all services use identical entity definitions
- Changes to schema propagate automatically
- Enables database migrations from any service

## Troubleshooting

### Build Errors

```bash
# Clear dist and rebuild
pnpm clean
pnpm build
```

### TypeScript Errors in Services

Ensure core package is built before using it:
```bash
# Build core first
pnpm --filter @mtg-scraper/core build

# Then build dependent services
pnpm --filter api build
```

### Module Import Errors

Make sure to import from package root:
```typescript
// Correct
import { StoreModule } from '@mtg-scraper/core';

// Incorrect
import { StoreModule } from '@mtg-scraper/core/dist/store';
```

## Related Documentation

- [Root README](../../README.md) - Project overview
- [API Service](../../apps/api/README.md) - Uses Queue, Cache, Store modules
- [Scheduler Service](../../apps/scheduler/README.md) - Uses Queue module
- [Scraper Service](../../apps/scraper/README.md) - Uses all modules
- [Shared Package](../shared/README.md) - Shared types

## License

ISC License - Copyright (c) Chris Payne
