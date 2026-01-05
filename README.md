# MTG Scraper

**MTG Card Finder** - A comprehensive Magic: The Gathering card price aggregation system that searches across multiple Toronto-area stores in real-time.

## Overview

MTG Scraper is a production-ready, scalable microservices application built with modern web technologies. It aggregates MTG card prices from 7+ local game stores, providing users with real-time price comparisons and inventory availability.

### Key Features

- **Real-Time Price Aggregation**: Search cards across multiple stores simultaneously
- **Smart Caching**: 24-hour cache with intelligent prefetching of popular cards
- **Priority Queue System**: User searches prioritized over background tasks
- **Horizontal Scaling**: Worker services can scale based on load
- **Modern UI**: React-based interface with Material UI components
- **Scheduled Scraping**: Automatic daily updates for popular EDH cards

### Supported Stores

- Face to Face Games (F2F)
- 401 Games
- Hobbiesville
- House of Cards (BinderPOS)
- Black Knight Games (BinderPOS)
- Exor Games (BinderPOS)
- Game Knight (BinderPOS)

## Architecture

This is an **Nx-managed pnpm workspace** monorepo with the following microservices:

```
┌──────────┐
│ UI(React)│ :3000
└─────┬────┘
      │ HTTP
      ▼
┌─────────────┐
│ API (NestJS)│ :5000
└──────┬──────┘
       │
   ┌───┴───────┐
   ▼           ▼
┌──────┐  ┌──────────┐
│Redis │  │PostgreSQL│
│Cache │  │ Stores   │
│Queue │  └──────────┘
└──┬───┘
   │
   ├──► Scheduler (NestJS) - Daily cron jobs
   │
   └──► Scraper Workers (NestJS) - 3 replicas (scalable)
```

### Services

| Service | Type | Port | Purpose |
|---------|------|------|---------|
| **UI** | React + Vite | 3000 | Frontend interface |
| **API** | NestJS | 5000 | REST API for card searches |
| **Scheduler** | NestJS | - | Daily scheduled tasks (cron) |
| **Scraper** | NestJS Workers | - | Processes scraping jobs from queue |
| **PostgreSQL** | Database | 5432 | Store metadata and configuration |
| **Redis** | Cache + Queue | 6379 | BullMQ job queue and caching |

### Technology Stack

**Backend**
- NestJS 11.x (Node.js framework)
- TypeORM (PostgreSQL ORM)
- BullMQ (Priority job queue)
- Undici (Fast HTTP client)
- Vitest (Testing)

**Frontend**
- React 19.2.0
- TanStack Router (File-based routing)
- Material UI v6.3.0
- Vite (Build tool)

**Infrastructure**
- Nx 22.3.3 (Monorepo management)
- pnpm 10.26.2 (Package manager)
- Docker & Docker Compose
- PostgreSQL 16
- Redis 7

## Project Structure

```
mtg-scraper/
├── apps/
│   ├── api/          # NestJS REST API service
│   ├── scheduler/    # NestJS scheduled tasks service
│   ├── scraper/      # NestJS worker service (scalable)
│   └── ui/           # React frontend with Vite
├── packages/
│   ├── core/         # Shared infrastructure & domain logic
│   └── shared/       # Shared types & utilities
├── docker-compose.yml      # Production setup
├── docker-compose.dev.yml  # Development with hot reload
└── package.json            # Root workspace config
```

## Getting Started

### Prerequisites

- **Docker** and **Docker Compose** (recommended for quickest setup)
- **Node.js** 18+ (for local development)
- **pnpm** 10.26.2 (installed automatically via `packageManager`)

### Quick Start with Docker Compose

#### Development Mode (with hot reload)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mtg-scraper
   ```

2. **Set up environment variables**
   ```bash
   # Copy example env files for each service
   cp apps/api/.env.example apps/api/.env
   cp apps/scheduler/.env.example apps/scheduler/.env
   cp apps/scraper/.env.example apps/scraper/.env
   cp apps/ui/.env.example apps/ui/.env
   ```

3. **Start all services**
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

4. **Access the application**
   - UI: http://localhost:3000
   - API: http://localhost:5000
   - API Health: http://localhost:5000/health

#### Production Mode

```bash
docker-compose up -d
```

### Local Development (without Docker)

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start PostgreSQL and Redis** (via Docker)
   ```bash
   docker-compose up postgres redis
   ```

3. **Set up environment variables** (copy `.env.example` files as shown above)

4. **Build shared packages**
   ```bash
   pnpm --filter @mtg-scraper/shared build
   pnpm --filter @mtg-scraper/core build
   ```

5. **Start services in development mode**
   ```bash
   # Terminal 1 - API
   cd apps/api
   pnpm dev

   # Terminal 2 - Scheduler
   cd apps/scheduler
   pnpm dev

   # Terminal 3 - Scraper
   cd apps/scraper
   pnpm dev

   # Terminal 4 - UI
   cd apps/ui
   pnpm dev
   ```

## Build and Deployment

### Building for Production

```bash
# Build all apps and packages
nx run-many --target=build --all

# Or build individually
pnpm --filter @mtg-scraper/shared build
pnpm --filter @mtg-scraper/core build
pnpm --filter api build
pnpm --filter scheduler build
pnpm --filter scraper build
pnpm --filter ui build
```

### Docker Deployment

```bash
# Production build and start
docker-compose up -d

# Scale scraper workers based on load
docker-compose up -d --scale scraper=5

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Service Interaction Flow

### User Card Search (High Priority)

1. User searches for a card via UI
2. API checks Redis cache for existing results
3. If cache miss:
   - API enqueues job to `card-scrape` queue (priority: 10)
   - API waits for completion via Redis pub/sub
4. Available scraper worker picks up job
5. Scraper fetches card data from all 7+ stores in parallel
6. Results cached in Redis (24-hour TTL)
7. Pub/sub notification sent to API
8. API returns aggregated results with price statistics

### Scheduled Popular Cards (Low Priority)

1. Scheduler runs daily cron job at 2 AM
2. Fetches top ~250 cards from EDHREC API
3. Enqueues each card to queue (priority: 1)
4. Processes in batches of 50
5. Scraper workers process overnight
6. Popular cards stay cached for 24 hours

### Priority System

- **User requests**: Priority 10 (immediate processing)
- **Scheduled tasks**: Priority 1 (background, overnight)
- BullMQ ensures high-priority jobs are processed first

## Configuration

### Environment Variables

Each service has its own `.env` file. See individual app READMEs for detailed configuration:

- [API Configuration](apps/api/README.md#configuration)
- [Scheduler Configuration](apps/scheduler/README.md#configuration)
- [Scraper Configuration](apps/scraper/README.md#configuration)
- [UI Configuration](apps/ui/README.md#configuration)

### Key Configuration Points

**Redis**
- Max memory: 512MB
- Policy: `noeviction` (preserve queue data)
- Keyspace notifications enabled for pub/sub
- AOF persistence enabled

**PostgreSQL**
- Database: `mtg_scraper`
- Stores table with dynamic scraper configuration
- TypeORM synchronization disabled (manual migrations)

**BullMQ Queue**
- Queue name: `card-scrape`
- Job retention: 100 completed, 500 failed
- Automatic retries: 3 attempts with exponential backoff

## Testing

```bash
# Run all tests
nx run-many --target=test --all

# Run tests for specific app
pnpm --filter api test

# Watch mode
pnpm --filter api test:watch

# Coverage
pnpm --filter api test:cov

# E2E tests (API)
pnpm --filter api test:e2e
```

## Scaling

### Horizontal Scaling - Scraper Workers

```bash
# Development
docker-compose -f docker-compose.dev.yml up --scale scraper=5

# Production
docker-compose up -d --scale scraper=10
```

Each scraper worker:
- Processes jobs independently from the shared queue
- Handles failures with automatic retries
- Can be added/removed without downtime
- Recommended: 3-10 workers depending on load

### Vertical Scaling - Resources

Adjust Docker resource limits in `docker-compose.yml`:

```yaml
scraper:
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 512M
```

## Monitoring and Health Checks

### Health Endpoints

- **API**: `GET /health` - Returns API, database, and Redis status
- **PostgreSQL**: `pg_isready` check every 10s
- **Redis**: `redis-cli ping` check every 10s

### Docker Health Checks

All services include health checks:
- Interval: 10-60s depending on service
- Timeout: 3s
- Retries: 3-5 before marked unhealthy

### Logs

```bash
# View all logs
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f scraper

# Last 100 lines
docker-compose logs --tail=100 scraper
```

## Troubleshooting

### Common Issues

**Services won't start**
```bash
# Check service status
docker-compose ps

# Check logs for errors
docker-compose logs

# Restart specific service
docker-compose restart api
```

**Database connection errors**
```bash
# Verify PostgreSQL is healthy
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Recreate database
docker-compose down -v
docker-compose up -d postgres
```

**Redis connection errors**
```bash
# Verify Redis is healthy
docker-compose exec redis redis-cli ping

# Clear Redis cache
docker-compose exec redis redis-cli FLUSHALL
```

**Scraper not processing jobs**
```bash
# Check scraper logs
docker-compose logs -f scraper

# Check queue status via Redis
docker-compose exec redis redis-cli
> LLEN bull:card-scrape:wait
> LLEN bull:card-scrape:active
```

**Port already in use**
```bash
# Change ports in docker-compose.yml
ports:
  - "5001:5000"  # Change external port
```

## Development

### Adding a New Store

1. Add store configuration to PostgreSQL `stores` table
2. Implement scraper logic in [apps/scraper/src/scraper/scraper.service.ts](apps/scraper/src/scraper/scraper.service.ts)
3. Update store scraper type if needed
4. Test with sample card searches

### Database Migrations

```bash
# Generate migration
cd apps/api
pnpm typeorm migration:generate -n MigrationName

# Run migrations
pnpm typeorm migration:run

# Revert migration
pnpm typeorm migration:revert
```

### Code Quality

```bash
# Lint
nx run-many --target=lint --all

# Format
pnpm format
```

## Project Documentation

For detailed information about each component:

- [API Service](apps/api/README.md) - REST API endpoints and architecture
- [Scheduler Service](apps/scheduler/README.md) - Cron jobs and scheduling
- [Scraper Service](apps/scraper/README.md) - Worker architecture and scrapers
- [UI Application](apps/ui/README.md) - React frontend and routing
- [Core Package](packages/core/README.md) - Shared infrastructure modules
- [Shared Package](packages/shared/README.md) - Shared types and utilities

## License

ISC License - Copyright (c) Chris Payne

## Author

**Chris Payne**

---

**Note**: This project is designed for educational and personal use. Please respect store websites' terms of service and implement appropriate rate limiting when scraping.
