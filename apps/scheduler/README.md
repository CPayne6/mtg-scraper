# Scheduler Service

NestJS-based scheduled tasks service that runs daily cron jobs to proactively scrape popular MTG cards.

## Overview

The Scheduler Service is a background service responsible for scheduling and executing periodic tasks. It uses NestJS's `@nestjs/schedule` module to run cron jobs that enqueue card scraping tasks into the BullMQ queue.

### Responsibilities

- Run daily cron jobs at configurable times (default: 2 AM)
- Fetch list of popular EDH cards from EDHREC API
- Enqueue cards to scraping queue with low priority
- Process cards in batches to avoid overwhelming the system
- Keep cache warm for frequently searched cards

## Architecture

```
┌──────────────────────────────────────────┐
│      Scheduler Service                   │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  PopularCardsScheduler             │ │
│  │  @Cron('0 2 * * *')                │ │
│  └────────────┬───────────────────────┘ │
│               │                          │
│  ┌────────────▼───────────────────────┐ │
│  │  EdhrecService                     │ │
│  │  - Fetch from EDHREC API           │ │
│  │  - Parse card names                │ │
│  └────────────┬───────────────────────┘ │
│               │                          │
│  ┌────────────▼───────────────────────┐ │
│  │  PopularCardsService               │ │
│  │  - Process in batches of 50        │ │
│  │  - Enqueue to queue (priority: 1)  │ │
│  └────────────┬───────────────────────┘ │
│               │                          │
│  ┌────────────▼───────────────────────┐ │
│  │  QueueService                      │ │
│  │  (from @mtg-scraper/core)          │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
                │
                ▼
          Redis Queue
      (card-scrape queue)
```

### Tech Stack

- **Framework**: NestJS 11.x
- **Scheduler**: @nestjs/schedule (cron)
- **Queue**: BullMQ
- **HTTP Client**: Native fetch
- **Testing**: Vitest

### Dependencies

**Key Libraries**
- `@nestjs/schedule` - Cron job scheduler
- `bullmq` - Job queue client
- `ioredis` - Redis client
- `cron` - Cron expression validation

## Project Structure

```
apps/scheduler/
├── src/
│   ├── edhrec/
│   │   ├── edhrec.service.ts           # EDHREC API integration
│   │   └── edhrec.service.spec.ts      # Unit tests
│   ├── popular-cards/
│   │   ├── popular-cards.module.ts     # Module definition
│   │   ├── popular-cards.service.ts    # Business logic
│   │   ├── popular-cards.scheduler.ts  # Cron job definition
│   │   ├── popular-cards.service.spec.ts
│   │   └── popular-cards.scheduler.spec.ts
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

## Priority System

The scheduler uses low priority to ensure user requests are processed first:

- **User requests** (from API): Priority = **10** (high)
- **Scheduled tasks** (from Scheduler): Priority = **1** (low)

This ensures users always get fast responses while background scraping happens when workers are idle.

## Configuration

### Environment Variables

Create `apps/scheduler/.env` from `.env.example`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# EDHREC API Configuration
# Base URL for EDHREC top cards API
EDHREC_API_URL=https://json.edhrec.com/pages/top/month-pastmonth
# Number of pages to fetch from EDHREC (each page has ~25 cards)
EDHREC_PAGES=10

# Popular Cards Configuration
# Fallback limit if EDHREC API fails
POPULAR_CARDS_LIMIT=1000

# Schedule Configuration
SCHEDULE_ENABLED=true
# Cron expression for daily scrape (default: 2 AM daily)
# Format: second minute hour day month dayOfWeek
DAILY_SCRAPE_TIME="0 2 * * *"
```

**Docker Environment**
When running in Docker, the following are automatically set:
- `REDIS_HOST=redis`
- `NODE_ENV=production` (or `development` in dev mode)

### Cron Schedule Configuration

The `DAILY_SCRAPE_TIME` environment variable accepts cron expressions:

**Examples**
- `0 2 * * *` - 2 AM daily (default)
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Midnight every Sunday
- `0 3 * * 1-5` - 3 AM on weekdays only

**Cron Expression Format**
```
┌────────────── second (0-59)
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12)
│ │ │ │ │ ┌──── day of week (0-6) (Sunday=0)
│ │ │ │ │ │
* * * * * *
```

### Disabling Scheduled Tasks

Set `SCHEDULE_ENABLED=false` to disable all scheduled tasks while keeping the service running.

## Development

### Local Development

```bash
# Install dependencies (from root)
pnpm install

# Start in watch mode
cd apps/scheduler
pnpm dev

# Or from root
pnpm --filter scheduler dev
```

### With Docker (Hot Reload)

```bash
# Start scheduler with hot reload
docker-compose -f docker-compose.dev.yml up scheduler

# View logs
docker-compose -f docker-compose.dev.yml logs -f scheduler
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
- `edhrec.service.spec.ts` - EDHREC API integration tests
- `popular-cards.service.spec.ts` - Service logic tests
- `popular-cards.scheduler.spec.ts` - Scheduler tests

## Building

### Development Build

```bash
pnpm build
```

Output: `dist/` directory

### Production Build with Docker

```bash
# Build image
docker build -f apps/scheduler/Dockerfile -t mtg-scheduler .

# Or use docker-compose
docker-compose build scheduler
```

**Dockerfile Features**
- Multi-stage build for optimized image size
- pnpm installation with frozen lockfile
- Non-root user for security
- Process health check via pgrep

## How It Works

### Daily Scrape Flow

1. **Cron Triggers** (2 AM daily by default)
   ```typescript
   @Cron(process.env.DAILY_SCRAPE_TIME || '0 2 * * *')
   async handleDailyScrape() {
     if (!this.scheduleEnabled) return;
     // Execute scrape
   }
   ```

2. **Fetch Popular Cards from EDHREC**
   ```typescript
   const cards = await this.edhrecService.getPopularCards(
     process.env.EDHREC_PAGES || 10
   );
   // Returns ~250 card names (10 pages × ~25 cards)
   ```

3. **Process in Batches**
   ```typescript
   const BATCH_SIZE = 50;
   for (let i = 0; i < cards.length; i += BATCH_SIZE) {
     const batch = cards.slice(i, i + BATCH_SIZE);
     await this.enqueueCards(batch);
   }
   ```

4. **Enqueue to Queue** (low priority)
   ```typescript
   await this.queueService.enqueue(QUEUE_NAMES.CARD_SCRAPE, {
     jobName: JOB_NAMES.SCRAPE_CARD,
     data: { cardName },
     opts: { priority: 1 } // Low priority for background tasks
   });
   ```

5. **Scraper Workers Process Jobs**
   - Jobs wait in queue until workers are available
   - User requests (priority 10) are processed first
   - Background jobs processed during idle time

### EDHREC API Integration

The service fetches popular cards from EDHREC's public API:

**API Endpoint**
```
https://json.edhrec.com/pages/top/month-pastmonth
```

**Pagination**
- Each page returns ~25 cards
- Default: Fetch 10 pages (~250 cards)
- Configurable via `EDHREC_PAGES` environment variable

**Card Extraction**
```typescript
// Navigate JSON structure to find card names
const cards = data.container?.json_dict?.cardlists
  ?.flatMap(list => list.cardviews?.map(card => card.name))
  ?.filter(Boolean) || [];
```

**Error Handling**
- Falls back to `POPULAR_CARDS_LIMIT` if API fails
- Logs errors without crashing service
- Skips scrape if no cards retrieved

### Batch Processing

Cards are processed in batches of 50 to:
- Avoid overwhelming Redis with thousands of simultaneous writes
- Provide progress logging
- Allow for graceful interruption

```typescript
const BATCH_SIZE = 50;
const batches = Math.ceil(cards.length / BATCH_SIZE);

for (let i = 0; i < batches; i++) {
  const start = i * BATCH_SIZE;
  const batch = cards.slice(start, start + BATCH_SIZE);

  await Promise.all(
    batch.map(card => this.enqueueCard(card))
  );

  this.logger.log(`Processed batch ${i + 1}/${batches}`);
}
```

## Monitoring

### Logging

The scheduler provides detailed logging:

```
[PopularCardsScheduler] Starting daily popular cards scrape...
[EdhrecService] Fetching page 1/10 from EDHREC API
[EdhrecService] Fetching page 2/10 from EDHREC API
...
[PopularCardsService] Enqueueing 247 popular cards for scraping
[PopularCardsService] Processed batch 1/5 (50 cards)
[PopularCardsService] Processed batch 2/5 (50 cards)
...
[PopularCardsScheduler] Daily scrape complete: 247 cards enqueued
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

The health check verifies the Node.js process is running.

### Queue Statistics

Check queue status via Redis CLI:

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Check waiting jobs
> LLEN bull:card-scrape:wait

# Check active jobs
> LLEN bull:card-scrape:active

# Check completed jobs
> LLEN bull:card-scrape:completed
```

## Deployment Considerations

### Single Instance Only

**IMPORTANT**: Only run **ONE instance** of the scheduler service.

- Multiple instances would create duplicate scheduled jobs
- Each instance runs the same cron independently
- This would cause the same 250 cards to be enqueued multiple times

**For Redundancy**
If you need high availability:
1. Implement leader election using Redis locks
2. Only the leader instance executes cron jobs
3. Other instances remain on standby

### Resource Requirements

The scheduler is very lightweight:
- **Memory**: < 100MB RAM
- **CPU**: Minimal (only active during cron execution)
- **Network**: Low (only API calls to EDHREC and Redis)
- **No HTTP server** required

### Dependencies

**Required**
- Redis connection (same Redis as API and scraper workers)

**NOT Required**
- PostgreSQL database
- HTTP port exposure
- File storage

### Running in Production

**Option 1: Docker Compose** (Recommended)
```bash
docker-compose up -d scheduler
```

**Option 2: PM2**
```bash
pnpm build
pm2 start dist/main.js --name mtg-scheduler
pm2 save
pm2 startup  # Enable auto-start on boot
```

**Option 3: systemd**
Create `/etc/systemd/system/mtg-scheduler.service`:
```ini
[Unit]
Description=MTG Scraper Scheduler
After=network.target redis.service

[Service]
Type=simple
User=mtg
WorkingDirectory=/app/scheduler
ExecStart=/usr/bin/node dist/main.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Common Issues

**Jobs not being created**

Check if cron is enabled:
```bash
# Verify SCHEDULE_ENABLED is true in logs
docker-compose logs scheduler | grep SCHEDULE_ENABLED
```

Check Redis connection:
```bash
# View scheduler logs
docker-compose logs -f scheduler

# Look for Redis connection errors
docker-compose logs scheduler | grep -i redis
```

Verify cron expression:
```bash
# Check if cron expression is valid
# Use https://crontab.guru/ to validate
```

**Jobs created but not processed**

This is expected behavior:
- Scheduler creates jobs
- Scraper workers process jobs
- Check scraper worker logs:
  ```bash
  docker-compose logs -f scraper
  ```

**Want to test without waiting for cron**

Temporarily change cron to run every minute:
```bash
# In .env
DAILY_SCRAPE_TIME="0 * * * * *"  # Every minute

# Restart scheduler
docker-compose restart scheduler
```

**EDHREC API failing**

Check API status:
```bash
curl https://json.edhrec.com/pages/top/month-pastmonth
```

View error logs:
```bash
docker-compose logs scheduler | grep -i edhrec
```

The service will skip scraping if API fails and log the error.

**Duplicate jobs in queue**

Check if multiple scheduler instances are running:
```bash
docker-compose ps scheduler
docker ps | grep scheduler
```

Only one instance should be running.

## Performance Optimization

### Batch Size Tuning

Adjust batch size based on Redis performance:

```typescript
// Smaller batches (25) - Slower but safer
const BATCH_SIZE = 25;

// Larger batches (100) - Faster but more memory
const BATCH_SIZE = 100;
```

### API Page Limit

Control how many cards to scrape:

```bash
# In .env
EDHREC_PAGES=5   # ~125 cards (faster)
EDHREC_PAGES=10  # ~250 cards (default)
EDHREC_PAGES=20  # ~500 cards (slower)
```

### Schedule Frequency

Balance freshness vs. load:

```bash
# Less frequent (once a week)
DAILY_SCRAPE_TIME="0 2 * * 0"  # Sunday 2 AM

# More frequent (twice daily)
DAILY_SCRAPE_TIME="0 2,14 * * *"  # 2 AM and 2 PM
```

## Future Enhancements

Planned improvements:
- [ ] Leader election for multi-instance redundancy
- [ ] Metrics/monitoring endpoints (Prometheus)
- [ ] Admin HTTP endpoints for manual triggers
- [ ] Additional scheduled tasks (cache cleanup, analytics)
- [ ] Configurable card sources beyond EDHREC
- [ ] Smart scheduling based on queue depth

## Related Documentation

- [Root README](../../README.md) - Project overview and setup
- [API Service](../api/README.md) - REST API that receives requests
- [Scraper Service](../scraper/README.md) - Worker that processes jobs
- [Core Package](../../packages/core/README.md) - Shared infrastructure
- [Shared Package](../../packages/shared/README.md) - Shared types

## License

ISC License - Copyright (c) Chris Payne
