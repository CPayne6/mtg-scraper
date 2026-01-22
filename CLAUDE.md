# CLAUDE.md - Project Guide for AI Assistants

This document provides a comprehensive overview of the ScoutLGS (MTG Scraper) project for AI assistants working with this codebase.

## Project Overview

**ScoutLGS** is a Magic: The Gathering card price aggregation platform that scrapes prices from 7+ Toronto-area game stores in real-time. Users can search for cards and compare prices across multiple retailers through a modern web interface.

## Technology Stack

### Backend
- **Framework**: NestJS 11.x (Node.js)
- **Database**: PostgreSQL 16 with TypeORM
- **Caching & Queue**: Redis 7 with BullMQ
- **HTTP Client**: Undici
- **Testing**: Vitest

### Frontend
- **Framework**: React 19.2.0
- **Build Tool**: Vite 7.2.4
- **Router**: TanStack Router (file-based routing)
- **UI Library**: Material UI 6.3.0

### Infrastructure
- **Monorepo**: pnpm workspaces + Nx
- **Containers**: Docker & Docker Compose
- **Production Orchestration**: Docker Swarm
- **Reverse Proxy**: Cloudflare Tunnel

## Project Structure

```
mtg-scraper/
├── apps/
│   ├── api/          # NestJS REST API (port 5000)
│   ├── scheduler/    # NestJS scheduled tasks service
│   ├── scraper/      # NestJS worker service (scalable)
│   └── ui/           # React frontend (port 3000)
├── packages/
│   ├── core/         # Shared infrastructure modules
│   └── shared/       # Shared types and constants
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── package.json
```

## Services

### API (`apps/api`)
- **Port**: 5000
- REST API handling card search requests
- Batch checks Redis cache, enqueues scraping jobs for missing stores, returns aggregated results
- **Results sorted by price** (lowest first) in `CardSearchResponse.results`
- **Key Endpoints**:
  - `GET /api/card/:cardName` - Search for MTG card (returns `CardSearchResponse`)
  - `GET /api/health` - Health check

### Scheduler (`apps/scheduler`)
- Background service (no HTTP port)
- Runs daily cron job at 2 AM EST
- Fetches popular EDH cards from EDHREC API and queues jobs per card-store combination
- Uses cached store list from StoreService
- Configurable via `DAILY_SCRAPE_TIME` and `SCHEDULE_ENABLED` env vars

### Scraper (`apps/scraper`)
- Background worker service (no HTTP port)
- Processes BullMQ `card-scrape` queue jobs (one store-card combo per job)
- **Concurrency**: 10 jobs per worker
- Horizontally scalable (3-10 workers recommended)
- **Supported scrapers**: f2f, 401, hobbies, binderpos (generic for multiple stores)
- **Key method**: `scraperService.searchCardAtStore(cardName, storeName)` - scrapes a single store

### UI (`apps/ui`)
- **Port**: 3000
- React frontend with card search, price comparison, and deck management
- **Key Routes**:
  - `/` - Home page with search
  - `/card/:name` - Search results
  - `/list/:listName` - Saved deck display

## Shared Packages

### @mtg-scraper/core (`packages/core`)
Shared infrastructure for backend services:
- **Database Module**: TypeORM config and connection
- **Store Module**: Store CRUD with in-memory caching (`findAllActive()`)
- **Queue Module**: BullMQ client with `enqueueScrapeJob()` and `enqueueScrapeJobsBulk()`
- **Cache Module**: Redis with pub/sub, per-store-card caching, MGET batch operations

### @mtg-scraper/shared (`packages/shared`)
Shared types and constants:
- `Card`, `CardWithStore`, `CardSearchResponse`, `PriceStats`
- `ScrapeCardJobData`, `ScrapeCardJobResult`, `StoreCardCacheEntry`
- `Condition` enum
- `QUEUE_NAMES`, `JOB_NAMES` constants

## Common Commands

### Development
```bash
# Start all services with Docker
docker-compose -f docker-compose.dev.yml up

# Scale scrapers
docker-compose -f docker-compose.dev.yml up --scale scraper=5
```

### Per-Service Commands (using Nx)

Run commands for specific services using `nx run <project>:<target>`:

```bash
# Build
nx run api:build
nx run scheduler:build
nx run scraper:build
nx run ui:build

# Development mode (watch)
nx run api:dev
nx run scheduler:dev
nx run scraper:dev

# Production start
nx run api:start:prod
nx run scheduler:start:prod
nx run scraper:start:prod

# Linting
nx run api:lint
nx run scheduler:lint
nx run scraper:lint

# Testing
nx run api:test
nx run scheduler:test
nx run scraper:test

# Test with coverage
nx run api:test:cov
nx run scheduler:test:cov
nx run scraper:test:cov
```

### Run Multiple Projects
```bash
# Build all projects
nx run-many -t build

# Test all projects
nx run-many -t test

# Build specific projects
nx run-many -t build -p api,scheduler,scraper
```

### API-Specific Commands
```bash
nx run api:seed                 # Seed database with stores
nx run api:migration:generate   # Generate migration
nx run api:migration:run        # Run migrations
nx run api:test:e2e             # E2E tests
```

### Scheduler-Specific Commands
```bash
nx run scheduler:scrape-test    # Test scrape manually
```

## Data Flow

1. User searches for card in UI
2. API gets all active stores from StoreService (cached)
3. API batch checks Redis cache for each store using `MGET` (`card:{cardname}:store:{storename}`)
4. For cache misses: marks stores as "being scraped" (lock key) and enqueues individual jobs
5. Scraper workers (concurrency 10) process one store-card combo per job
6. Results cached per store in Redis (24-hour TTL), lock removed
7. API waits via Redis `PSUBSCRIBE` pattern (`__keyspace@0__:card:{cardname}:store:*`)
8. API aggregates results from all stores, sorts by price (lowest first), returns to UI

### Priority System
- User requests: Priority 10 (immediate)
- Scheduled tasks: Priority 1 (background)

### Retry Logic
- Failed store scrapes are cached with `error` and `retryCount` fields
- API retries stores with errors up to `MAX_STORE_RETRIES` (2) times
- After max retries, store error is included in response but no more retries attempted

## Environment Variables

Key variables (see `.env.example` files in each app):

| Variable | Service | Description |
|----------|---------|-------------|
| `PORT` | API | API port (default: 5000) |
| `FRONTEND_URL` | API | CORS allowed origin |
| `REDIS_HOST/PORT` | All | Redis connection |
| `DATABASE_*` | API, Scraper | PostgreSQL connection |
| `SCHEDULE_ENABLED` | Scheduler | Enable/disable cron |
| `DAILY_SCRAPE_TIME` | Scheduler | Cron expression |
| `VITE_API_URL` | UI | Backend API URL |

---

## Production Server Access

### SSH Connection
```bash
ssh scoutlgs_lan
```

This connects to the production server running the ScoutLGS application.

### Production Deployment

The project runs in production using **Docker Swarm** orchestration:

```bash
# Deploy/update the stack
docker stack deploy -c docker-compose.prod.yml scoutlgs

# View running services
docker service ls

# View logs for a service
docker service logs scoutlgs_api
docker service logs scoutlgs_scraper
docker service logs scoutlgs_scheduler
docker service logs scoutlgs_ui

# Scale scraper workers
docker service scale scoutlgs_scraper=5

# Check service health
docker service ps scoutlgs_api
```

### Production Architecture

- **Reverse Proxy**: Cloudflare Tunnel handles external traffic and SSL
- **Images**: Pulled from GitHub Container Registry (ghcr.io)
- **Secrets**: Managed via Docker Swarm secrets
- **Persistence**: PostgreSQL and Redis data persisted via Docker volumes

### Monitoring in Production

```bash
# Check queue status
docker exec $(docker ps -q -f name=redis) redis-cli LLEN bull:card-scrape:wait
docker exec $(docker ps -q -f name=redis) redis-cli LLEN bull:card-scrape:active

# Database connectivity
docker exec $(docker ps -q -f name=postgres) psql -U postgres -d scoutlgs -c "SELECT 1"

# View resource usage
docker stats
```

### Common Production Tasks

```bash
# Restart a service
docker service update --force scoutlgs_api

# View detailed service info
docker service inspect scoutlgs_api

# Pull latest images and redeploy
docker-compose -f docker-compose.prod.yml pull
docker stack deploy -c docker-compose.prod.yml scoutlgs
```

### Production Environment

Production uses Docker Swarm secrets for sensitive configuration. Set up secrets with:
```bash
pnpm secrets:setup
```

---

## Database

### Store Entity
Primary database entity storing retailer information:
- `name` - Unique identifier (e.g., 'f2f')
- `displayName` - Human-readable name
- `baseUrl` - Website URL
- `scraperType` - 'f2f' | '401' | 'hobbies' | 'binderpos'
- `scraperConfig` - JSON config (searchPath, etc.)
- `isActive` - Include in scraping

## Supported Stores

| Store | Scraper Type |
|-------|--------------|
| Face to Face Games | f2f |
| 401 Games | 401 |
| Hobbiesville | hobbies |
| House of Cards | binderpos |
| Black Knight Games | binderpos |
| Exor Games | binderpos |
| Game Knight | binderpos |

## Adding New Stores

1. Create scraper in `apps/scraper/src/scrapers/`
2. Register in `ScraperFactory`
3. Add store entry to database via seed or migration
4. Test with `pnpm scrape-test` in scheduler

## Caching Strategy

- **Cache Key**: `card:{normalized_cardname}:store:{store_slug}` (e.g., `card:lightning bolt:store:f2f`)
- **TTL**: 24 hours
- **Lock Key**: `scraping:{cardname}:store:{storename}` (prevents duplicate scrapes per store-card)
- **Pub/Sub**: Redis PSUBSCRIBE with pattern matching for real-time updates
- **Batch Operations**: Uses Redis MGET for efficient multi-store cache checks

### Store Identifiers
- **Store `name`** (slug): Used in cache keys, job data, database lookups (e.g., `f2f`, `401`, `hobbies`)
- **Store `displayName`**: Used in `card.store` field for UI display (e.g., "Face to Face Games")

### Key Cache Service Methods
| Method | Description |
|--------|-------------|
| `setStoreCard(cardName, storeName, results, error?, retryCount?)` | Cache results for a single store-card |
| `getStoreCard(cardName, storeName)` | Get cached results for a single store-card |
| `getMultipleStoreCards(cardName, storeNames[])` | Batch MGET for multiple stores |
| `markStoreAsBeingScraped(cardName, storeName, requestId)` | Set lock (returns false if already locked) |
| `markStoreScrapeComplete(cardName, storeName)` | Remove lock after scrape completes |
| `waitForStoresScrapeCompletion(cardName, storeNames[], timeoutMs)` | Wait for stores via PSUBSCRIBE |

---

## Manual Scheduler Trigger

The scheduler service exposes HTTP endpoints on port 5001 for manually triggering scrapes and checking status.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/manual/trigger?limit=N` | Trigger a manual scrape of popular cards (default: 1000 cards) |
| `GET` | `/manual/status` | Check current scrape job status |

### Triggering a Manual Scrape in Production

The scheduler container uses Alpine Linux and doesn't have curl, so use Node.js fetch from inside the container.

```bash
# SSH into production server
ssh scoutlgs_lan

# Find the scheduler container name
SCHEDULER=$(docker ps -f name=scheduler --format '{{.Names}}')

# Trigger a manual scrape (default 1000 cards)
docker exec $SCHEDULER node -e "fetch('http://localhost:5001/manual/trigger', {method: 'PUT'}).then(r => r.json()).then(console.log)"

# Trigger with custom limit (e.g., 500 cards)
docker exec $SCHEDULER node -e "fetch('http://localhost:5001/manual/trigger?limit=500', {method: 'PUT'}).then(r => r.json()).then(console.log)"

# Check scrape status
docker exec $SCHEDULER node -e "fetch('http://localhost:5001/manual/status').then(r => r.json()).then(console.log)"
```

### One-liner from local machine

```bash
# Trigger scrape via SSH (gets container name and triggers in one command)
ssh scoutlgs_lan "docker exec \$(docker ps -f name=scheduler --format '{{.Names}}') node -e \"fetch('http://localhost:5001/manual/trigger', {method: 'PUT'}).then(r => r.json()).then(console.log)\""

# Check status
ssh scoutlgs_lan "docker exec \$(docker ps -f name=scheduler --format '{{.Names}}') node -e \"fetch('http://localhost:5001/manual/status').then(r => r.json()).then(console.log)\""
```

### Response Examples

**Trigger Response:**
```json
{ "message": "Scrape triggered successfully" }
```

**Status Response (running):**
```json
{
  "status": "running",
  "initiatedAt": 1705881234567,
  "details": {
    "currentScrapeCount": 150,
    "totalScrapeCount": 1000
  }
}
```

**Status Response (completed):**
```json
{
  "status": "completed",
  "initiatedAt": 1705881234567,
  "finishedAt": 1705884567890
}
```
