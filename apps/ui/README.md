# UI Application

React-based frontend application for searching and browsing MTG card prices across multiple stores.

## Overview

The UI Application provides a modern, responsive interface for searching MTG cards and comparing prices across Toronto-area game stores. Built with React 19 and Material UI, it offers a clean user experience with real-time search results.

### Features

- **Card Search**: Search by card name across all stores
- **Price Comparison**: View prices side-by-side from multiple stores
- **Dark/Light Mode**: Themeable interface using Material UI
- **Deck Management**: Save and manage card lists/decks
- **Responsive Design**: Works on desktop and mobile devices
- **Real-Time Updates**: Shows live search progress

## Architecture

```
┌────────────────────────────────────────┐
│         UI Application (React)         │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  TanStack Router                 │ │
│  │  - / (Home)                      │ │
│  │  - /card/:name (Search Results)  │ │
│  │  - /list/:name (Deck Display)    │ │
│  └──────────┬───────────────────────┘ │
│             │                          │
│  ┌──────────▼───────────────────────┐ │
│  │  Components                      │ │
│  │  - CardsList (search results)    │ │
│  │  - DeckDisplay (saved lists)     │ │
│  │  - Card (individual card)        │ │
│  │  - Navigation                    │ │
│  └──────────┬───────────────────────┘ │
│             │                          │
│  ┌──────────▼───────────────────────┐ │
│  │  Context Providers               │ │
│  │  - ThemeProvider (dark/light)    │ │
│  │  - LibraryContext (deck mgmt)    │ │
│  │  - SnackbarProvider (toasts)     │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
                │
                ▼
        API Service (port 5000)
        GET /card/:cardName
```

### Tech Stack

- **Framework**: React 19.2.0
- **Build Tool**: Vite 7.2.4
- **Router**: TanStack Router 1.144.0
- **UI Library**: Material UI 6.3.0
- **Styling**: Emotion (CSS-in-JS)
- **Theme**: next-themes
- **Notifications**: notistack
- **Icons**: React Icons

### Dependencies

**Workspace Packages**
- `@mtg-scraper/shared` - Shared types (Card, CardSearchResponse, etc.)

**Key Libraries**
- `@mui/material` - Material UI components
- `@tanstack/react-router` - File-based routing
- `@emotion/react` & `@emotion/styled` - CSS-in-JS styling
- `next-themes` - Theme management
- `notistack` - Toast notifications
- `react-dropzone` - File upload for deck lists
- `react-icons` - Icon library

## Project Structure

```
apps/ui/
├── src/
│   ├── components/
│   │   ├── CardsList/
│   │   │   ├── CardsList.tsx         # Search results grid
│   │   │   └── Card.tsx              # Individual card component
│   │   ├── DeckDisplay/
│   │   │   └── DeckDisplay.tsx       # Deck list display
│   │   └── Navigation/
│   │       └── Navigation.tsx        # Top nav bar
│   ├── context/
│   │   └── LibraryContext.tsx        # Deck management state
│   ├── routes/
│   │   ├── __root.tsx                # Root layout
│   │   ├── index.tsx                 # Home page
│   │   ├── card.$name.tsx            # Card search route
│   │   └── list.$listName.tsx        # Deck display route
│   ├── App.tsx                       # App component
│   ├── main.tsx                      # Entry point
│   └── routeTree.gen.ts              # Generated route tree
├── public/
│   ├── Scout-logo.png                # App logo
│   └── ScoutLGS-logo.jpg             # Alt logo
├── index.html                        # HTML template
├── vite.config.ts                    # Vite configuration
├── tsconfig.json                     # TypeScript config
├── .env.example                      # Environment template
└── package.json
```

## Configuration

### Environment Variables

Create `apps/ui/.env` from `.env.example`:

```bash
# API Configuration
VITE_API_URL=http://localhost:5000
```

**Docker Environment**
When running in Docker, the API URL is automatically configured to point to the API service.

**Production**
Set `VITE_API_URL` to your production API endpoint.

### Build Configuration

The Vite configuration includes:
- **TanStack Router Plugin**: Automatic route generation
- **React Plugin**: Fast Refresh and JSX support
- **Port**: 3000 (configurable)
- **Proxy**: Optional API proxy for development

## Development

### Local Development

```bash
# Install dependencies (from root)
pnpm install

# Build shared packages first
pnpm --filter @mtg-scraper/shared build

# Start in development mode
cd apps/ui
pnpm dev

# Or from root
pnpm --filter ui dev
```

The app will be available at http://localhost:3000

### With Docker (Hot Reload)

```bash
# Start UI with hot reload
docker-compose -f docker-compose.dev.yml up ui

# View logs
docker-compose -f docker-compose.dev.yml logs -f ui
```

### Development Server Features

- **Hot Module Replacement (HMR)**: Instant updates on file save
- **Fast Refresh**: Preserves component state during updates
- **TypeScript**: Type checking in development
- **ESLint**: Real-time linting feedback

## Building

### Development Build

```bash
pnpm build
```

Output: `dist/` directory with optimized production assets

### Production Build with Docker

```bash
# Build image
docker build -f apps/ui/Dockerfile -t mtg-ui .

# Or use docker-compose
docker-compose build ui
```

**Dockerfile Features**
- Multi-stage build (build → serve)
- nginx Alpine for serving static files
- Optimized bundle size
- Gzip compression enabled

### Build Optimization

The Vite build includes:
- **Code splitting**: Automatic route-based chunking
- **Tree shaking**: Remove unused code
- **Minification**: Terser for JavaScript
- **Asset optimization**: Image and font optimization

## Routing

### TanStack Router

The app uses TanStack Router for type-safe, file-based routing.

**Routes**
- `/` - Home page with search input
- `/card/:name` - Card search results (e.g., `/card/Lightning%20Bolt`)
- `/list/:listName` - Saved deck display

**Route Generation**
Routes are automatically generated from files in `src/routes/`:

```typescript
// src/routes/card.$name.tsx
export const Route = createFileRoute('/card/$name')({
  component: CardSearchPage,
  loader: async ({ params }) => {
    // Fetch card data
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/card/${params.name}`
    );
    return response.json();
  }
});
```

**Navigation**
```typescript
import { useNavigate } from '@tanstack/react-router';

const navigate = useNavigate();
navigate({ to: '/card/$name', params: { name: 'Lightning Bolt' } });
```

## Components

### CardsList Component

Displays search results in a grid layout.

**Props**
```typescript
interface CardsListProps {
  cards: CardWithStore[];
  stats: PriceStats;
}
```

**Features**
- Grid layout with Material UI
- Sorting by price, store, condition
- Filtering by foil status
- Responsive grid (1-4 columns)

### Card Component

Individual card display with store information.

**Props**
```typescript
interface CardProps {
  card: CardWithStore;
  onAddToLibrary?: (card: CardWithStore) => void;
}
```

**Features**
- Card image (Scryfall)
- Price display
- Store badge
- Condition and foil indicators
- "Add to Library" button

### DeckDisplay Component

Displays saved deck lists.

**Props**
```typescript
interface DeckDisplayProps {
  listName: string;
}
```

**Features**
- Card count by name
- Total deck value
- Export to text file
- Remove cards from list

### Navigation Component

Top navigation bar.

**Features**
- Logo and branding
- Search bar (global)
- Theme toggle (dark/light)
- Deck/library links

## Context & State Management

### LibraryContext

Manages deck/library state across the app.

**Provider**
```typescript
<LibraryProvider>
  <App />
</LibraryProvider>
```

**Usage**
```typescript
const { library, addToLibrary, removeFromLibrary } = useLibrary();

// Add card to library
addToLibrary('My Deck', card);

// Get deck by name
const myDeck = library['My Deck'];

// Remove card
removeFromLibrary('My Deck', cardId);
```

**Storage**
- Uses localStorage for persistence
- Automatically syncs across tabs

### Theme Management

Uses `next-themes` for dark/light mode.

**Provider**
```typescript
<ThemeProvider attribute="class" defaultTheme="system">
  <App />
</ThemeProvider>
```

**Usage**
```typescript
import { useTheme } from 'next-themes';

const { theme, setTheme } = useTheme();

// Toggle theme
setTheme(theme === 'dark' ? 'light' : 'dark');
```

## Styling

### Material UI Theme

Custom theme configuration with dark/light variants:

```typescript
const theme = createTheme({
  palette: {
    mode: 'dark',  // or 'light'
    primary: {
      main: '#1976d2'
    },
    secondary: {
      main: '#dc004e'
    }
  },
  typography: {
    fontFamily: 'Roboto, sans-serif'
  }
});
```

### Emotion CSS-in-JS

Styled components using Emotion:

```typescript
import styled from '@emotion/styled';

const CardContainer = styled.div`
  padding: 16px;
  border-radius: 8px;
  background: ${props => props.theme.palette.background.paper};
`;
```

## API Integration

### Fetching Card Data

**Search Endpoint**
```typescript
const searchCard = async (cardName: string): Promise<CardSearchResponse> => {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/card/${encodeURIComponent(cardName)}`
  );

  if (!response.ok) {
    throw new Error('Card search failed');
  }

  return response.json();
};
```

**Response Type** (from `@mtg-scraper/shared`)
```typescript
interface CardSearchResponse {
  results: CardWithStore[];
  stats: PriceStats;
}
```

**Error Handling**
```typescript
try {
  const data = await searchCard(cardName);
  setResults(data.results);
} catch (error) {
  enqueueSnackbar('Card search failed', { variant: 'error' });
}
```

## User Features

### Search Flow

1. User enters card name in search bar
2. Navigate to `/card/:name`
3. Loader fetches data from API
4. Display results grid with cards from all stores
5. Show price statistics (min, max, avg)

### Deck Management

1. **Add Card**: Click "Add to Library" on any card
2. **Select Deck**: Choose existing deck or create new
3. **View Deck**: Navigate to `/list/:listName`
4. **Export**: Download deck list as text file
5. **Remove**: Remove individual cards from deck

### Theme Switching

1. Click theme toggle in navigation
2. Switches between dark and light mode
3. Preference saved to localStorage
4. Respects system preference on first visit

## Deployment

### Production Build

```bash
# Build for production
pnpm build

# Preview production build locally
pnpm preview
```

### Serving with nginx

The production Dockerfile uses nginx to serve static files:

```nginx
server {
    listen 3000;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

### Environment Variables in Production

**Build-time Variables**
- `VITE_API_URL` must be set at build time
- Vite embeds these into the bundle

**Docker**
```bash
docker build \
  --build-arg VITE_API_URL=https://api.example.com \
  -f apps/ui/Dockerfile \
  -t mtg-ui .
```

## Performance Optimization

### Code Splitting

Automatic route-based code splitting:
- Each route loads only its required code
- Reduces initial bundle size
- Faster first page load

### Lazy Loading

```typescript
import { lazy } from 'react';

const DeckDisplay = lazy(() => import('./components/DeckDisplay'));
```

### Asset Optimization

- Images: Optimized and served via CDN
- Fonts: Subset and self-hosted
- Icons: Tree-shaken from react-icons

### Caching Strategy

- API responses: Cached by router loader
- Static assets: Long-term caching (1 year)
- HTML: No cache (always fetch latest)

## Troubleshooting

### Common Issues

**API connection errors**

Check API URL:
```bash
echo $VITE_API_URL
# Should be http://localhost:5000
```

Verify API is running:
```bash
curl http://localhost:5000/health
```

**Build errors**

Clear cache and rebuild:
```bash
rm -rf node_modules/.vite
pnpm build
```

Check TypeScript errors:
```bash
pnpm tsc --noEmit
```

**Routing not working in production**

Ensure nginx config has fallback to index.html:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

**Theme not persisting**

Check localStorage:
```javascript
localStorage.getItem('theme')
```

Clear and retry:
```javascript
localStorage.removeItem('theme')
```

## Development Tips

### Hot Reload Issues

If HMR stops working:
1. Check for syntax errors in console
2. Restart dev server
3. Clear browser cache

### TypeScript Errors

Generate route types:
```bash
pnpm tsr generate
```

Type check without emitting:
```bash
pnpm tsc --noEmit
```

### Debugging

**React DevTools**
Install React DevTools browser extension for component inspection.

**Network Tab**
Monitor API calls and responses in browser DevTools.

**Console Logs**
Add debug logs with context:
```typescript
console.log('[CardsList] Rendering', { count: cards.length });
```

## Related Documentation

- [Root README](../../README.md) - Project overview and setup
- [API Service](../api/README.md) - Backend API specification
- [Shared Package](../../packages/shared/README.md) - Shared types
- [TanStack Router Docs](https://tanstack.com/router) - Router documentation
- [Material UI Docs](https://mui.com) - Component library

## License

ISC License - Copyright (c) Chris Payne
