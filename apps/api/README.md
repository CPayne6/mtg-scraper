# API Service

NestJS-based REST API service that handles MTG card search requests and orchestrates the scraping workflow.

## Overview

The API service is the main entry point for the application. It receives card search requests from the UI, manages the queue system, and returns aggregated results from multiple stores.

### Responsibilities

- Handle card search requests via REST API
- Check Redis cache for existing results
- Enqueue scraping jobs with high priority
- Wait for scraper completion via pub/sub
- Return aggregated results with price statistics
- Provide health check endpoints
- Manage CORS for frontend communication

## Architecture

```
┌─────────────────────────────────────┐
│         API Service                 │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   CardController             │  │
│  │   GET /card/:cardName        │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │   CardService                │  │
│  │   - Search orchestration     │  │
│  │   - Result aggregation       │  │
│  └──┬───┬───────────────┬───────┘  │
│     │   │               │           │
│     │   │               │           │
│  ┌──▼───▼──┐  ┌────────▼────────┐  │
│  │ Cache   │  │ Queue           │  │
│  │ Service │  │ Service         │  │
│  │ (Redis) │  │ (BullMQ)        │  │
│  └─────────┘  └─────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   HealthController           │  │
│  │   GET /health                │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Tech Stack

- **Framework**: NestJS 11.x
- **ORM**: TypeORM
- **Queue**: BullMQ (via @nestjs/bull)
- **Cache**: Redis (via ioredis)
- **Validation**: class-validator, class-transformer
- **Testing**: Vitest, Supertest

### Dependencies

**Workspace Packages**
- `@mtg-scraper/core` - Infrastructure modules (Queue, Cache, Store, Database)
- `@mtg-scraper/shared` - Shared types and constants

**Key Libraries**
- `@nestjs/bull` - BullMQ integration
- `@nestjs/typeorm` - TypeORM integration
- `@nestjs/terminus` - Health checks
- `ioredis` - Redis client
- `pg` - PostgreSQL driver

## Project Structure

```
apps/api/
├── src/
│   ├── card/
│   │   ├── card.controller.ts       # REST endpoints
│   │   ├── card.service.ts          # Business logic
│   │   ├── card.controller.spec.ts  # Unit tests
│   │   └── card.service.spec.ts
│   ├── health/
│   │   ├── health.controller.ts     # Health check endpoint
│   │   └── health.controller.spec.ts
│   ├── database/
│   │   └── seed.ts                  # Database seeding script
│   ├── app.module.ts                # Root module
│   └── main.ts                      # Bootstrap
├── test/
│   └── card.e2e-spec.ts             # E2E tests
├── Dockerfile                       # Production build
├── Dockerfile.dev                   # Development with hot reload
├── nest-cli.json                    # NestJS CLI config
├── tsconfig.json                    # TypeScript config
├── vitest.config.ts                 # Unit tests config
├── vitest.config.e2e.ts             # E2E tests config
├── .env.example                     # Environment template
└── package.json
```

## API Endpoints

### Card Search

**Endpoint**: `GET /card/:cardName`

Search for an MTG card across all configured stores.

**Parameters**
- `cardName` (path) - Name of the card to search (URL encoded)

**Response**: `CardSearchResponse`
```typescript
{
  results: CardWithStore[];  // Array of cards with store info
  stats: PriceStats;         // Price statistics across all results
}
```

**Example**
```bash
# Search for "Lightning Bolt"
curl http://localhost:5000/card/Lightning%20Bolt
```

**Response Example**
```json
{
  "results": [
    {
      "name": "Lightning Bolt",
      "set": "Foundations",
      "price": 0.25,
      "condition": "NM",
      "foil": false,
      "quantity": 50,
      "store": {
        "name": "f2f",
        "displayName": "Face to Face Games",
        "url": "https://www.facetofacegames.com"
      }
    }
  ],
  "stats": {
    "min": 0.25,
    "max": 1.50,
    "avg": 0.75,
    "median": 0.50
  }
}
```

**Flow**
1. Receive request with card name
2. Check Redis cache for `card:{cardname}`
3. If found, return cached results immediately
4. If not found:
   - Set `scraping:{cardname}` lock in Redis (5min TTL)
   - Enqueue job to `card-scrape` queue with priority 10
   - Wait up to 60s for scraper completion via pub/sub
   - Return results or timeout error
5. Multiple concurrent requests for same card will wait for single scrape

### Health Check

**Endpoint**: `GET /health`

Returns health status of API and its dependencies.

**Response**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

## Configuration

### Environment Variables

Create `apps/api/.env` from `.env.example`:

```bash
# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:3000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mtg_scraper
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_SYNCHRONIZE=false
```

**Docker Environment**
When running in Docker, the following are automatically set:
- `REDIS_HOST=redis`
- `DATABASE_HOST=postgres`
- `NODE_ENV=production` (or `development` in dev mode)

### Configuration Schema Validation

The API uses Joi for environment validation on startup:

```typescript
// apps/api/src/app.module.ts
validationSchema: Joi.object({
  PORT: Joi.number().default(5000),
  FRONTEND_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  DATABASE_HOST: Joi.string().required(),
  // ... etc
})
```

## Development

### Local Development

```bash
# Install dependencies (from root)
pnpm install

# Build shared packages first
pnpm --filter @mtg-scraper/shared build
pnpm --filter @mtg-scraper/core build

# Start in watch mode
cd apps/api
pnpm dev

# Or from root
pnpm --filter api dev
```

### With Docker (Hot Reload)

```bash
# Start all services with hot reload
docker-compose -f docker-compose.dev.yml up api

# View logs
docker-compose -f docker-compose.dev.yml logs -f api
```

### Database Seeding

Seed the database with initial store configurations:

```bash
cd apps/api
pnpm seed
```

This will populate the `stores` table with:
- Store names and display names
- Base URLs and logo URLs
- Scraper types (f2f, 401, hobbies, binderpos)
- Scraper configurations (search paths, etc.)

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:cov

# With UI
pnpm test:ui
```

**Test Files**
- `card.controller.spec.ts` - Controller tests
- `card.service.spec.ts` - Service tests
- `health.controller.spec.ts` - Health endpoint tests

### E2E Tests

```bash
# Run E2E tests
pnpm test:e2e
```

**Test Files**
- `test/card.e2e-spec.ts` - Full API flow tests

**E2E Test Setup**
- Uses Vitest with Supertest
- Separate config: `vitest.config.e2e.ts`
- Requires Redis and PostgreSQL running

## Building

### Development Build

```bash
pnpm build
```

Output: `dist/` directory

### Production Build with Docker

```bash
# Build image
docker build -f apps/api/Dockerfile -t mtg-api .

# Or use docker-compose
docker-compose build api
```

**Dockerfile Features**
- Multi-stage build for optimized image size
- pnpm installation with frozen lockfile
- Workspace dependencies properly linked
- Non-root user for security
- Health check built-in

## How It Works

### Card Search Flow

1. **Request Received**
   ```typescript
   @Get(':cardName')
   async searchCard(@Param('cardName') cardName: string)
   ```

2. **Cache Check**
   ```typescript
   const cached = await this.cacheService.get(`card:${cardName}`);
   if (cached) return cached;
   ```

3. **Distributed Lock**
   ```typescript
   const lockKey = `scraping:${cardName}`;
   const acquired = await this.cacheService.setNX(lockKey, 'true', 300);
   ```

4. **Enqueue Job** (if lock acquired)
   ```typescript
   await this.queueService.enqueue(QUEUE_NAMES.CARD_SCRAPE, {
     jobName: JOB_NAMES.SCRAPE_CARD,
     data: { cardName },
     opts: { priority: 10 } // High priority for user requests
   });
   ```

5. **Wait for Results** (via pub/sub)
   ```typescript
   const result = await this.cacheService.waitForKey(
     `card:${cardName}`,
     60000 // 60 second timeout
   );
   ```

6. **Return Results**
   ```typescript
   return {
     results: result.cards,
     stats: this.calculateStats(result.cards)
   };
   ```

### Concurrent Request Handling

Multiple users searching for the same card:
- First request acquires distributed lock
- Subsequent requests wait on pub/sub
- All receive results when scraping completes
- Prevents duplicate scraping work

### Error Handling

```typescript
try {
  // Search logic
} catch (error) {
  if (error instanceof NotFoundException) {
    throw new NotFoundException(`Card "${cardName}" not found`);
  }
  if (error instanceof RequestTimeoutException) {
    throw new RequestTimeoutException('Search timeout');
  }
  throw new InternalServerErrorException('Search failed');
}
```

## Performance Considerations

### Caching Strategy

- **Cache Key**: `card:{cardname}` (normalized)
- **TTL**: 24 hours (86400 seconds)
- **Eviction**: Automatic via Redis TTL
- **Hit Rate**: ~80% for popular cards

### Queue Priority

User requests use priority 10 to ensure immediate processing:
```typescript
{ priority: 10 }  // User request
{ priority: 1 }   // Scheduled background task
```

### Connection Pooling

TypeORM connection pool configured for optimal performance:
```typescript
{
  type: 'postgres',
  poolSize: 10,
  extra: {
    max: 10,
    idleTimeoutMillis: 30000
  }
}
```

## Monitoring

### Health Checks

The `/health` endpoint checks:
- **Database**: TypeORM connection ping
- **Redis**: Redis PING command
- **Overall**: Returns `ok` only if all dependencies are healthy

**Docker Health Check**
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/health', ...)"]
  interval: 30s
  timeout: 3s
  retries: 3
```

### Logging

NestJS built-in logger with context:
```typescript
this.logger.log(`Searching for card: ${cardName}`, 'CardService');
this.logger.error(`Search failed: ${error.message}`, error.stack, 'CardService');
```

## Troubleshooting

### Common Issues

**Cannot connect to Redis**
```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping
```

**Cannot connect to PostgreSQL**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U postgres -d mtg_scraper -c "SELECT 1"
```

**Scraper not processing jobs**
```bash
# Check queue status
docker-compose exec redis redis-cli
> LLEN bull:card-scrape:wait
> LLEN bull:card-scrape:active

# Check scraper logs
docker-compose logs -f scraper
```

**Search timing out**
- Increase `CACHE_WAIT_TIMEOUT` in CardService
- Check scraper worker count (scale up if needed)
- Verify stores are accessible

## Related Documentation

- [Root README](../../README.md) - Project overview and setup
- [Scraper Service](../scraper/README.md) - Worker that processes jobs
- [Scheduler Service](../scheduler/README.md) - Background task scheduler
- [Core Package](../../packages/core/README.md) - Shared infrastructure
- [Shared Package](../../packages/shared/README.md) - Shared types

## License

ISC License - Copyright (c) Chris Payne
