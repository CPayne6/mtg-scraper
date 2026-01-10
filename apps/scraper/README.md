# Scraper Service

NestJS-based worker service that processes card scraping jobs from the BullMQ queue. This service is horizontally scalable - multiple instances can run concurrently to process jobs in parallel.

## Overview

The Scraper Service is a dedicated worker that listens to the `card-scrape` queue and fetches MTG card data from multiple store websites. It's designed to scale horizontally based on workload.

### Responsibilities

- Listen to BullMQ `card-scrape` queue for jobs
- Scrape card data from 7+ Toronto-area game stores
- Parse HTML and extract card information (price, condition, quantity, etc.)
- Cache results in Redis with 24-hour TTL
- Notify waiting API requests via Redis pub/sub
- Handle proxy rotation (optional)
- Retry failed jobs automatically

## Architecture

```
┌────────────────────────────────────────┐
│     Scraper Worker Service             │
│     (3+ instances - scalable)          │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  ScrapeCardProcessor             │ │
│  │  (BullMQ Worker)                 │ │
│  └──────────┬───────────────────────┘ │
│             │                          │
│  ┌──────────▼───────────────────────┐ │
│  │  ScraperService                  │ │
│  │  - Orchestrates multi-store      │ │
│  │  - Parallel scraping             │ │
│  │  - Result aggregation            │ │
│  └──┬───────────────────────────────┘ │
│     │                                  │
│     ├──► F2F Scraper                  │
│     ├──► 401 Games Scraper            │
│     ├──► Hobbiesville Scraper         │
│     └──► BinderPOS Scraper (4 stores)│
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  ProxyService (Optional)         │ │
│  │  - Webshare                      │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### Tech Stack

- **Framework**: NestJS 11.x
- **Queue**: BullMQ (job processor)
- **ORM**: TypeORM (for stores config)
- **HTTP Client**: Undici (fast, low-overhead)
- **HTML Parsing**: Custom parsers per store
- **Testing**: Vitest

### Dependencies

**Workspace Packages**
- `@mtg-scraper/core` - Infrastructure modules (Queue, Cache, Store, Database)
- `@mtg-scraper/shared` - Shared types and constants

**Key Libraries**
- `bullmq` - Job queue worker
- `undici` - Fast HTTP client
- `ioredis` - Redis client
- `typeorm` - Database ORM
- `pg` - PostgreSQL driver

## Project Structure

```
apps/scraper/
├── src/
│   ├── scraper/
│   │   ├── scraper.module.ts           # Module definition
│   │   ├── scraper.service.ts          # Main scraping logic
│   │   ├── scraper.processor.ts        # BullMQ job processor
│   │   ├── proxy/
│   │   │   ├── proxy.service.ts        # Proxy rotation service
│   │   │   └── proxy.service.spec.ts
│   │   ├── scraper.service.spec.ts     # Unit tests
│   │   └── scraper.processor.spec.ts
│   ├── app.module.ts                   # Root module
│   └── main.ts                         # Bootstrap
├── Dockerfile                          # Production build
├── Dockerfile.dev                      # Development with hot reload
├── nest-cli.json                       # NestJS CLI config
├── tsconfig.json                       # TypeScript config
├── vitest.config.ts                    # Test config
├── .env.example                        # Environment template
└── package.json
```

## Supported Stores

### Store Types

The scraper supports 4 different scraper types:

1. **`f2f`** - Face to Face Games (custom parser)
2. **`401`** - 401 Games (custom parser)
3. **`hobbies`** - Hobbiesville (custom parser)
4. **`binderpos`** - Generic BinderPOS platform parser (4 stores)

### Active Stores

| Store Name | Type | Base URL |
|------------|------|----------|
| Face to Face Games | f2f | facetofacegames.com |
| 401 Games | 401 | store.401games.ca |
| Hobbiesville | hobbies | hobbiesvilletoronto.ca |
| House of Cards | binderpos | houseofcardstoronto.com |
| Black Knight Games | binderpos | www.blackknightgames.ca |
| Exor Games | binderpos | www.exorgames.com |
| Game Knight | binderpos | www.gameknight.ca |

### BinderPOS Platform

BinderPOS is a common e-commerce platform used by multiple stores. The `binderpos` scraper type is configured per-store with:
- Custom search path (e.g., `/search?q=`)
- Base URL
- Store branding

## Configuration

### Environment Variables

Create `apps/scraper/.env` from `.env.example`:

```bash
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

# Proxy Configuration - Webshare (Optional)
WEBSHARE_USERNAME=your_webshare_username
WEBSHARE_PASSWORD=your_webshare_password
WEBSHARE_PORT=80
WEBSHARE_HOST=p.webshare.io

# Proxy Configuration - Oxylabs (Optional)
OXYLABS_USERNAME=your_oxylabs_username
OXYLABS_PASSWORD=your_oxylabs_password
OXYLABS_PORT=8000
OXYLABS_HOST=dc.oxylabs.io
```

**Docker Environment**
When running in Docker, the following are automatically set:
- `REDIS_HOST=redis`
- `DATABASE_HOST=postgres`
- `NODE_ENV=production` (or `development` in dev mode)

### Proxy Configuration (Optional)

Proxies are optional but recommended for:
- Avoiding rate limiting
- Bypassing IP blocks
- Improved reliability

**Supported Providers**
- **Webshare**: Residential/datacenter proxies
- **Oxylabs**: Premium residential proxies

If proxy credentials are not provided, scrapers will connect directly.

## Development

### Local Development

```bash
# Install dependencies (from root)
pnpm install

# Build shared packages first
pnpm --filter @mtg-scraper/shared build
pnpm --filter @mtg-scraper/core build

# Start in watch mode
cd apps/scraper
pnpm dev

# Or from root
pnpm --filter scraper dev
```

### With Docker (Hot Reload)

```bash
# Start single scraper worker
docker-compose -f docker-compose.dev.yml up scraper

# Start multiple scraper workers (scale to 5)
docker-compose -f docker-compose.dev.yml up --scale scraper=5

# View logs
docker-compose -f docker-compose.dev.yml logs -f scraper
```

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
- `scraper.service.spec.ts` - Service logic tests
- `scraper.processor.spec.ts` - Job processor tests
- `proxy.service.spec.ts` - Proxy service tests

## Building

### Development Build

```bash
pnpm build
```

Output: `dist/` directory

### Production Build with Docker

```bash
# Build image
docker build -f apps/scraper/Dockerfile -t mtg-scraper .

# Or use docker-compose
docker-compose build scraper
```

**Dockerfile Features**
- Multi-stage build for optimized image size
- pnpm installation with frozen lockfile
- Workspace dependencies properly linked
- Non-root user for security
- Process health check via pgrep

## How It Works

### Job Processing Flow

1. **Worker Connects to Queue**
   ```typescript
   @Processor(QUEUE_NAMES.CARD_SCRAPE)
   export class ScrapeCardProcessor {
     @Process(JOB_NAMES.SCRAPE_CARD)
     async processJob(job: Job<ScrapeCardJobData>) {
       // Process scraping job
     }
   }
   ```

2. **Receive Job Data**
   ```typescript
   interface ScrapeCardJobData {
     cardName: string;
     priority: number;  // 10 = user request, 1 = scheduled
   }
   ```

3. **Fetch Active Stores**
   ```typescript
   const stores = await this.storeService.getActiveStores();
   // Returns all stores with is_active = true
   ```

4. **Scrape All Stores in Parallel**
   ```typescript
   const results = await Promise.allSettled(
     stores.map(store => this.scrapeStore(store, cardName))
   );
   // Parallel scraping for speed
   ```

5. **Aggregate and Filter Results**
   ```typescript
   const cards = results
     .filter(r => r.status === 'fulfilled' && r.value.length > 0)
     .flatMap(r => r.value)
     .sort((a, b) => a.price - b.price);  // Sort by price
   ```

6. **Cache Results**
   ```typescript
   await this.cacheService.set(
     `card:${cardName}`,
     { cards, stats: this.calculateStats(cards) },
     86400  // 24-hour TTL
   );
   ```

7. **Notify Waiting Requests** (via pub/sub)
   ```typescript
   await this.cacheService.publish(`card:${cardName}`, 'complete');
   ```

### Store-Specific Scraping

#### Face to Face Games (`f2f`)

**Search URL**: `https://www.facetofacegames.com/search/?search_query={cardName}`

**Parser Logic**
- Fetches HTML page
- Parses product cards from search results
- Extracts: name, set, price, condition, foil status, quantity

**Example Card Data**
```typescript
{
  name: "Lightning Bolt",
  set: "Foundations",
  price: 0.25,
  condition: "NM",
  foil: false,
  quantity: 50
}
```

#### 401 Games (`401`)

**Search URL**: `https://store.401games.ca/search?q={cardName}`

**Parser Logic**
- Fetches API endpoint (returns JSON)
- Parses product data
- Handles variant selection (foil/non-foil)

#### Hobbiesville (`hobbies`)

**Search URL**: `https://www.hobbiesvilletoronto.ca/search?q={cardName}`

**Parser Logic**
- Fetches HTML page
- Parses Shopify product listings
- Extracts pricing and availability

#### BinderPOS Stores (`binderpos`)

**Search URL**: `{store.baseUrl}{store.scraperConfig.searchPath}{cardName}`

Example: `https://houseofcardstoronto.com/search?q=Lightning+Bolt`

**Parser Logic**
- Generic parser for BinderPOS platform
- Configurable search path per store
- Handles consistent HTML structure across stores

**Supported BinderPOS Stores**
- House of Cards (`/search?q=`)
- Black Knight Games (`/search?q=`)
- Exor Games (`/search?q=`)
- Game Knight (`/search?q=`)

### Proxy Rotation

The `ProxyService` provides optional proxy support:

**Proxy Selection**
```typescript
const proxy = this.proxyService.getProxy();
// Returns: { host, port, username, password }
```

**HTTP Request with Proxy**
```typescript
const response = await undici.request(url, {
  proxy: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
});
```

**Fallback Behavior**
- If proxy fails, retry without proxy
- Logs proxy errors for monitoring
- Rotates between available proxies

## Scaling

### Horizontal Scaling

The scraper service is designed to scale horizontally:

```bash
# Development - Scale to 5 workers
docker-compose -f docker-compose.dev.yml up --scale scraper=5

# Production - Scale to 10 workers
docker-compose up -d --scale scraper=10
```

**How It Works**
- Each worker instance connects to the same Redis queue
- BullMQ distributes jobs across all workers
- Workers process jobs independently
- No coordination needed between workers

**Recommended Worker Count**
- **Light load** (occasional searches): 1-3 workers
- **Medium load** (regular usage): 3-5 workers
- **Heavy load** (high traffic): 5-10 workers

### Performance Considerations

**Parallel Store Scraping**
- Each job scrapes 7+ stores in parallel
- Using `Promise.allSettled` for concurrent execution
- Total scrape time ≈ slowest store response time

**Queue Concurrency**
- Each worker processes 1 job at a time by default
- Configurable via BullMQ concurrency option
- Trade-off: higher concurrency = more memory usage

**Memory Usage**
- ~100-200MB per worker instance
- Increase with concurrency and cached data

**CPU Usage**
- Low during idle (waiting for jobs)
- Spike during HTML parsing
- Network I/O is the bottleneck

## Monitoring

### Logging

Detailed logging for each scraping operation:

```
[ScrapeCardProcessor] Processing job: Lightning Bolt (priority: 10)
[ScraperService] Scraping 7 stores for: Lightning Bolt
[ScraperService] F2F: Found 12 results
[ScraperService] 401: Found 8 results
[ScraperService] Hobbies: Found 3 results
[ScraperService] House of Cards: Found 15 results
[ScraperService] Total results: 38 cards
[ScrapeCardProcessor] Job completed: Lightning Bolt (38 results)
```

### Health Checks

**Docker Health Check**
```yaml
healthcheck:
  test: ["CMD", "pgrep", "-f", "node dist/main.js"]
  interval: 60s
  timeout: 3s
  retries: 3
```

### Queue Metrics

Monitor job processing via Redis CLI:

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Check waiting jobs
> LLEN bull:card-scrape:wait

# Check active jobs (being processed)
> LLEN bull:card-scrape:active

# Check completed jobs
> LLEN bull:card-scrape:completed

# Check failed jobs
> LLEN bull:card-scrape:failed
```

## Error Handling

### Job Retry Logic

BullMQ automatically retries failed jobs:

```typescript
{
  attempts: 3,               // Retry up to 3 times
  backoff: {
    type: 'exponential',    // Exponential backoff
    delay: 5000             // Start at 5 seconds
  }
}
```

**Retry Schedule**
- 1st retry: After 5 seconds
- 2nd retry: After 10 seconds
- 3rd retry: After 20 seconds
- After 3 failures: Job moved to failed queue

### Error Types

**Network Errors**
- Timeout (30s default)
- Connection refused
- DNS resolution failure
- **Action**: Retry with backoff

**Parsing Errors**
- Invalid HTML structure
- Missing expected elements
- **Action**: Log error, return empty results for that store

**Proxy Errors**
- Proxy authentication failure
- Proxy timeout
- **Action**: Fallback to direct connection

## Troubleshooting

### Common Issues

**No jobs being processed**

Check if scraper is connected:
```bash
docker-compose logs -f scraper | grep "connected"
```

Check queue for waiting jobs:
```bash
docker-compose exec redis redis-cli
> LLEN bull:card-scrape:wait
```

Verify Redis connection:
```bash
docker-compose ps redis
```

**Store scraping failing**

Check store website is accessible:
```bash
curl -I https://www.facetofacegames.com
```

View error logs:
```bash
docker-compose logs scraper | grep -i error
```

Test specific store parser (add debug logs)

**Slow scraping performance**

Scale up worker count:
```bash
docker-compose up -d --scale scraper=5
```

Check if stores are slow to respond:
```bash
docker-compose logs scraper | grep "Found"
# Look for slow stores
```

Consider adding proxies to avoid rate limiting

**Memory leaks**

Monitor memory usage:
```bash
docker stats scraper
```

Restart workers periodically:
```bash
docker-compose restart scraper
```

Check for unclosed HTTP connections

## Adding New Stores

### Step 1: Add Store to Database

```typescript
// apps/api/src/database/seed.ts
{
  name: 'new-store',
  displayName: 'New Store Name',
  baseUrl: 'https://www.newstore.com',
  logoUrl: 'https://www.newstore.com/logo.png',
  scraperType: 'binderpos',  // or create custom type
  scraperConfig: {
    searchPath: '/search?q='
  },
  isActive: true
}
```

### Step 2: Create Custom Parser (if needed)

If the store doesn't match existing scraper types:

```typescript
// apps/scraper/src/scraper/scraper.service.ts

private async scrapeNewStore(
  store: Store,
  cardName: string
): Promise<CardWithStore[]> {
  const url = `${store.baseUrl}/search?q=${encodeURIComponent(cardName)}`;

  const response = await this.httpClient.get(url);
  const html = await response.text();

  // Parse HTML and extract cards
  const cards = this.parseNewStoreHtml(html);

  return cards.map(card => ({
    ...card,
    store: {
      name: store.name,
      displayName: store.displayName,
      url: store.baseUrl
    }
  }));
}
```

### Step 3: Update Scraper Type Map

```typescript
// Map scraper type to parser method
const scraperMap = {
  'f2f': this.scrapeF2F,
  '401': this.scrape401,
  'hobbies': this.scrapeHobbies,
  'binderpos': this.scrapeBinderPOS,
  'newstore': this.scrapeNewStore  // Add new type
};
```

### Step 4: Test

```bash
# Test the new store
curl http://localhost:5000/card/Lightning%20Bolt

# Check logs
docker-compose logs scraper | grep "New Store"
```

## Performance Optimization Tips

### Reduce Scraping Time

1. **Optimize parsers**: Minimize HTML parsing overhead
2. **Use connection pooling**: Reuse HTTP connections
3. **Implement caching**: Cache search results aggressively
4. **Filter early**: Remove out-of-stock items before processing

### Reduce Memory Usage

1. **Stream large responses**: Don't load entire HTML into memory
2. **Clear references**: Explicitly null large objects after use
3. **Limit concurrency**: Process fewer jobs simultaneously
4. **Use smaller Docker images**: Alpine-based images

### Improve Reliability

1. **Add circuit breakers**: Stop hitting failing stores
2. **Implement timeouts**: Don't wait forever for slow stores
3. **Use health checks**: Restart unhealthy workers
4. **Monitor error rates**: Alert on high failure rates

## Related Documentation

- [Root README](../../README.md) - Project overview and setup
- [API Service](../api/README.md) - REST API that creates jobs
- [Scheduler Service](../scheduler/README.md) - Background task scheduler
- [Core Package](../../packages/core/README.md) - Shared infrastructure
- [Shared Package](../../packages/shared/README.md) - Shared types

## License

ISC License - Copyright (c) Chris Payne
