# MTG Scraper - Scheduler Service

Independent service responsible for scheduled scraping tasks.

## Purpose

The Scheduler Service handles all periodic/scheduled scraping operations:
- Daily scraping of the top 1000 popular MTG cards
- Future: Cache warming, cleanup tasks, etc.

It enqueues scrape jobs into the shared Redis queue with **low priority** to ensure user-initiated requests are processed first.

## Architecture

```
Scheduler Service
    │
    ├── Cron Jobs (@nestjs/schedule)
    │   └── Daily at 2 AM: Scrape popular cards
    │
    ├── PopularCards Module
    │   ├── Service: Get list of cards (hardcoded or from API)
    │   └── Scheduler: Execute daily scrape
    │
    └── Queue Client (BullMQ)
        └── Enqueue jobs to Redis with priority = 1
```

## Priority System

- **User requests** (from API): Priority = 10 (high)
- **Scheduled tasks** (from Scheduler): Priority = 1 (low)

This ensures users always get fast responses while background scraping happens when the queue is idle.

## Installation

```bash
cd apps/scheduler
pnpm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional
POPULAR_CARDS_LIMIT=1000
SCHEDULE_ENABLED=true
DAILY_SCRAPE_TIME="0 2 * * *"

# Future: External API
# POPULAR_CARDS_API_URL=https://api.example.com/popular-cards
```

## Running

### Development
```bash
pnpm start:dev
```

### Production
```bash
pnpm build
pnpm start:prod
```

### With PM2 (recommended for production)
```bash
pm2 start dist/main.js --name mtg-scheduler
pm2 save
pm2 startup  # Enable auto-start on system boot
```

## Popular Cards List

### Current: Hardcoded List
The service uses a hardcoded list of popular cards in `src/popular-cards/popular-cards.data.ts`.

To update the list:
1. Edit `popular-cards.data.ts`
2. Add/remove cards from the `POPULAR_CARDS` array
3. Restart the service

### Future: External API
When you want to fetch popular cards from an API:

1. Set the `POPULAR_CARDS_API_URL` environment variable
2. Implement the API fetching logic in `PopularCardsService.fetchFromApi()`
3. Example for Scryfall API:
   ```typescript
   private async fetchFromApi(apiUrl: string, limit: number): Promise<string[]> {
     const response = await fetch(`${apiUrl}?order=edhrec&limit=${limit}`);
     const data = await response.json();
     return data.data.map(card => card.name);
   }
   ```

The service will automatically use the API if configured, falling back to the hardcoded list if the API fails.

## Cron Schedule

The default schedule is **2 AM daily** (`0 2 * * *`).

To change the schedule:
- Set `DAILY_SCRAPE_TIME` environment variable
- Use cron expression format: `second minute hour day month dayOfWeek`

Examples:
- `0 2 * * *` - 2 AM daily (default)
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Midnight every Sunday
- `0 3 * * 1-5` - 3 AM on weekdays only

## Manual Trigger

To manually trigger a scrape (for testing):

```typescript
// In your code or via CLI
const scheduler = app.get(PopularCardsScheduler);
await scheduler.triggerManualScrape();
```

## Monitoring

### Check if scheduler is running
```bash
pm2 status mtg-scheduler
```

### View logs
```bash
pm2 logs mtg-scheduler
```

### Queue statistics
The scheduler logs progress every 100 cards and completion stats:
```
[PopularCardsScheduler] Starting daily popular cards scrape...
[PopularCardsScheduler] Enqueueing 1000 popular cards for scraping
[PopularCardsScheduler] Enqueued 100/1000 cards
[PopularCardsScheduler] Enqueued 200/1000 cards
...
[PopularCardsScheduler] Daily scrape complete: 1000 enqueued, 0 skipped
```

## Deployment Considerations

### Single Instance Only
- Only run **ONE instance** of the scheduler service
- Multiple instances would create duplicate scheduled jobs
- If you need redundancy, use leader election with Redis locks

### Resource Requirements
- Very lightweight (< 100MB RAM)
- Minimal CPU usage (only active during cron execution)
- No need for horizontal scaling

### Dependencies
- Requires Redis connection (same Redis as API and workers)
- Does NOT require database connection
- Does NOT expose HTTP endpoints (no port needed)

## Troubleshooting

### Jobs not being created
1. Check `SCHEDULE_ENABLED` is `true`
2. Verify Redis connection in logs
3. Check cron expression is valid
4. Ensure scheduler service is running (`pm2 status`)

### Jobs created but not processed
- This is expected! Jobs are processed by worker services, not the scheduler
- Check worker logs to see job processing
- Verify workers are connected to the same Redis instance

### Want to disable scheduled tasks temporarily
```bash
# Set in .env or environment
SCHEDULE_ENABLED=false
```

## Future Enhancements

- [ ] Implement API fetching for popular cards
- [ ] Add more scheduled tasks (cache warming, cleanup, etc.)
- [ ] Add metrics/monitoring endpoints
- [ ] Add admin HTTP endpoints for manual triggers
- [ ] Implement leader election for redundancy
