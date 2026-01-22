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
- Checks Redis cache, enqueues scraping jobs, returns aggregated results
- **Key Endpoints**:
  - `GET /card/:cardName` - Search for MTG card
  - `GET /health` - Health check

### Scheduler (`apps/scheduler`)
- Background service (no HTTP port)
- Runs daily cron job at 2 AM EST
- Fetches popular EDH cards from EDHREC API and queues them for scraping
- Configurable via `DAILY_SCRAPE_TIME` and `SCHEDULE_ENABLED` env vars

### Scraper (`apps/scraper`)
- Background worker service (no HTTP port)
- Processes BullMQ `card-scrape` queue jobs
- Scrapes 7+ stores in parallel
- Horizontally scalable (3-10 workers recommended)
- **Supported scrapers**: f2f, 401, hobbies, binderpos (generic for multiple stores)

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
- Database Module (TypeORM config)
- Store Module (store CRUD with caching)
- Queue Module (BullMQ client)
- Cache Module (Redis with pub/sub)

### @mtg-scraper/shared (`packages/shared`)
Shared types and constants:
- `Card`, `CardWithStore`, `CardSearchResponse`, `PriceStats`
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
2. API checks Redis cache (`card:{cardname}`)
3. If cache miss: enqueues job with priority 10 (high)
4. Scraper worker picks up job, scrapes all stores in parallel
5. Results cached in Redis (24-hour TTL)
6. API notified via Redis pub/sub, returns results to UI

### Priority System
- User requests: Priority 10 (immediate)
- Scheduled tasks: Priority 1 (background)

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

- **Cache Key**: `card:{normalized_cardname}`
- **TTL**: 24 hours
- **Lock Key**: `scraping:{cardname}` (prevents duplicate scrapes)
- **Pub/Sub**: Redis keyspace notifications for real-time updates
