# @mtg-scraper/shared

Shared types and utilities package for both frontend and backend.

## Overview

The Shared package provides TypeScript types, interfaces, and constants that are used across the entire application - from React frontend to NestJS backend services. This ensures type consistency and prevents duplication.

### Purpose

- **Type Safety**: End-to-end type safety from UI to database
- **Single Source of Truth**: One definition for shared data structures
- **DRY Principle**: Avoid duplicating type definitions
- **Contract Definition**: Clear API contracts between services
- **Zero Dependencies**: Pure TypeScript, works anywhere

## Exports

### Card Types

Core card data structures used throughout the application.

#### Card

Basic card information from a single store.

```typescript
export interface Card {
  name: string;
  set?: string;
  price: number;
  condition: Condition;
  foil: boolean;
  quantity: number;
  url?: string;
}
```

#### CardWithStore

Card with associated store information.

```typescript
export interface CardWithStore extends Card {
  store: StoreInfo;
}
```

Used for:
- Search results display
- Deck list items
- Price comparison

#### Condition

Card condition enum.

```typescript
export type Condition =
  | 'NM'  // Near Mint
  | 'LP'  // Lightly Played
  | 'MP'  // Moderately Played
  | 'HP'  // Heavily Played
  | 'DMG' // Damaged
  | 'Unknown';
```

### Store Types

Store-related type definitions.

#### StoreInfo

Basic store information included with cards.

```typescript
export interface StoreInfo {
  name: string;
  displayName: string;
  url: string;
  logoUrl?: string;
}
```

Used in:
- Card search results
- Store badges in UI
- API responses

### Statistics Types

#### PriceStats

Price statistics across all search results.

```typescript
export interface PriceStats {
  min: number;
  max: number;
  avg: number;
  median: number;
}
```

Used for:
- Price range display
- Market analysis
- Deal highlighting

### API Response Types

#### CardSearchResponse

Response format for card search endpoint.

```typescript
export interface CardSearchResponse {
  results: CardWithStore[];
  stats: PriceStats;
}
```

Used by:
- **Backend**: API service response format
- **Frontend**: TypeScript fetch typing

**Example Response**
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

### Queue Types

BullMQ job data contracts.

#### ScrapeCardJobData

Job data for card scraping jobs.

```typescript
export interface ScrapeCardJobData {
  cardName: string;
}
```

Used when:
- API enqueues user searches (priority 10)
- Scheduler enqueues popular cards (priority 1)

#### ScrapeCardJobResult

Job result after scraping completion.

```typescript
export interface ScrapeCardJobResult {
  cardName: string;
  cards: CardWithStore[];
  stats: PriceStats;
  scrapedAt: Date;
}
```

Used by:
- Scraper workers to return results
- Cache service to store results

### Constants

Application-wide constant values.

#### QUEUE_NAMES

Queue identifiers for BullMQ.

```typescript
export const QUEUE_NAMES = {
  CARD_SCRAPE: 'card-scrape'
} as const;
```

#### JOB_NAMES

Job type identifiers within queues.

```typescript
export const JOB_NAMES = {
  SCRAPE_CARD: 'scrape-card'
} as const;
```

Used to:
- Ensure consistent queue/job naming
- Prevent typos
- Enable IDE autocomplete

## Installation

The shared package is part of the pnpm workspace and is automatically linked.

```bash
# From root
pnpm install

# Build shared package
pnpm --filter @mtg-scraper/shared build
```

## Development

### Building

```bash
# Build package
pnpm build

# Watch mode (auto-rebuild on changes)
pnpm watch

# Clean dist
pnpm clean
```

### Output

Builds to `dist/` directory with:
- `dist/index.js` - Compiled JavaScript
- `dist/index.d.ts` - TypeScript declarations
- `dist/**/*.d.ts` - Individual type declarations

## Usage

### In Backend Services (NestJS)

```typescript
import {
  CardWithStore,
  CardSearchResponse,
  ScrapeCardJobData,
  QUEUE_NAMES,
  JOB_NAMES
} from '@mtg-scraper/shared';

// API Controller
@Get(':cardName')
async searchCard(
  @Param('cardName') cardName: string
): Promise<CardSearchResponse> {
  // ...
}

// Queue Service
await this.queueService.enqueue(QUEUE_NAMES.CARD_SCRAPE, {
  jobName: JOB_NAMES.SCRAPE_CARD,
  data: { cardName } as ScrapeCardJobData
});

// Scraper Service
async scrapeCard(data: ScrapeCardJobData): Promise<CardWithStore[]> {
  // ...
}
```

### In Frontend (React)

```typescript
import type {
  CardSearchResponse,
  CardWithStore,
  PriceStats
} from '@mtg-scraper/shared';

// Fetch card data
const searchCard = async (name: string): Promise<CardSearchResponse> => {
  const response = await fetch(`/api/card/${name}`);
  return response.json();
};

// Component props
interface CardListProps {
  cards: CardWithStore[];
  stats: PriceStats;
}

const CardList: React.FC<CardListProps> = ({ cards, stats }) => {
  // ...
};
```

## Type Safety Benefits

### Contract Enforcement

**Backend API Response**
```typescript
// API Service
async searchCard(cardName: string): Promise<CardSearchResponse> {
  return {
    results: cards,  // Must be CardWithStore[]
    stats: stats     // Must be PriceStats
  };
}
```

**Frontend Consumption**
```typescript
// UI Component
const data: CardSearchResponse = await fetch(...);
// TypeScript knows exact shape of data
data.results[0].store.displayName  // ✓ Type-safe
```

### IDE Autocomplete

```typescript
import { QUEUE_NAMES } from '@mtg-scraper/shared';

// IDE suggests: CARD_SCRAPE
await queue.enqueue(QUEUE_NAMES.
```

### Refactoring Safety

If you change a type in shared:
```typescript
// Before
interface Card {
  price: number;
}

// After
interface Card {
  price: number;
  currency: string;  // New field
}
```

TypeScript will show errors everywhere the type is used, ensuring you update all usages.

## Adding New Types

### Step 1: Define Type

```typescript
// src/types/newFeature.ts
export interface NewFeature {
  id: string;
  name: string;
}
```

### Step 2: Export from Index

```typescript
// src/index.ts
export * from './types/newFeature';
```

### Step 3: Rebuild

```bash
pnpm --filter @mtg-scraper/shared build
```

### Step 4: Use in Services

```typescript
import { NewFeature } from '@mtg-scraper/shared';
```

## File Structure

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── card.ts           # Card-related types
│   │   ├── store.ts          # Store-related types
│   │   ├── queue.ts          # Queue job types
│   │   └── api.ts            # API response types
│   ├── constants/
│   │   └── queue.ts          # Queue/job name constants
│   └── index.ts              # Re-exports everything
├── dist/                     # Build output
├── tsconfig.json             # TypeScript config
├── tsconfig.build.json       # Build-specific config
└── package.json
```

## TypeScript Configuration

### Build Config (`tsconfig.build.json`)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

**Key Settings**
- `declaration: true` - Generate .d.ts files
- `declarationMap: true` - Enable go-to-definition in IDEs
- `module: "ESNext"` - Modern ES modules

## Dependencies

**Zero Runtime Dependencies**
- Pure TypeScript types
- No external libraries
- Works in any TypeScript/JavaScript project

**Dev Dependencies**
- `typescript` - TypeScript compiler

## Best Practices

### Type Naming

- **Interfaces**: PascalCase (e.g., `CardWithStore`)
- **Types**: PascalCase (e.g., `Condition`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `QUEUE_NAMES`)

### File Organization

- Group related types in same file
- Use barrel exports (index.ts)
- Keep types domain-specific

### Documentation

```typescript
/**
 * Card information with associated store details.
 * Used for displaying search results across multiple stores.
 */
export interface CardWithStore extends Card {
  store: StoreInfo;
}
```

### Avoid Over-Abstraction

Don't create types for one-off uses. Only add types that are:
- Used in multiple places
- Part of API contracts
- Shared between frontend/backend

## Troubleshooting

### Types Not Updating

Rebuild the package:
```bash
pnpm --filter @mtg-scraper/shared build
```

Restart TypeScript server in IDE:
- VS Code: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"

### Import Errors

Ensure you're importing from package root:
```typescript
// Correct
import { Card } from '@mtg-scraper/shared';

// Incorrect
import { Card } from '@mtg-scraper/shared/dist/types/card';
```

### Build Errors

Clear dist and rebuild:
```bash
pnpm --filter @mtg-scraper/shared clean
pnpm --filter @mtg-scraper/shared build
```

## Related Documentation

- [Root README](../../README.md) - Project overview
- [Core Package](../core/README.md) - Backend infrastructure
- [API Service](../../apps/api/README.md) - Uses API types
- [UI Application](../../apps/ui/README.md) - Uses Card/Store types

## License

ISC License - Copyright (c) Chris Payne
