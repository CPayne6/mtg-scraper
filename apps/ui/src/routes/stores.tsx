import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  Container,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import ArrowBack from '@mui/icons-material/ArrowBack'
import OpenInNew from '@mui/icons-material/OpenInNew'
import Search from '@mui/icons-material/Search'
import Storefront from '@mui/icons-material/Storefront'
import { fetchStores, type StoreDirectoryEntry } from '@/utils/storesApi'

export const Route = createFileRoute('/stores')({
  component: StoresPage,
})

function StoresPage() {
  const [stores, setStores] = useState<StoreDirectoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    fetchStores(controller.signal)
      .then((data) => {
        setStores(data)
        setLoading(false)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('Unable to load stores right now.')
        setLoading(false)
      })

    return () => controller.abort()
  }, [])

  const filteredStores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return stores

    return stores.filter((store) => {
      return [
        store.displayName,
        store.name,
        store.platformType ?? '',
        store.scraperType,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [query, stores])

  const activeCount = stores.filter((store) => store.isActive).length
  const discoveryCount = stores.filter((store) => store.discoveryEnabled).length

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <StoreDirectoryHeader />

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2.5, md: 3 },
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2.5}
              alignItems={{ xs: 'stretch', md: 'center' }}
              justifyContent="space-between"
            >
              <Stack spacing={1} sx={{ minWidth: 0 }}>
                <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
                  Store Directory
                </Typography>
                <Typography color="text.secondary">
                  Local game stores currently tracked by ScoutLGS.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Chip size="small" label={`${stores.length} stores`} />
                  <Chip size="small" color="success" variant="outlined" label={`${activeCount} active`} />
                  <Chip size="small" variant="outlined" label={`${discoveryCount} discovery enabled`} />
                </Stack>
              </Stack>

              <TextField
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search stores"
                size="small"
                sx={{ width: { xs: '100%', md: 320 } }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Stack>
          </Paper>

          {error ? (
            <Alert severity="error">{error}</Alert>
          ) : loading ? (
            <StoreGridSkeleton />
          ) : filteredStores.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
              <Typography color="text.secondary">No stores match that search.</Typography>
            </Paper>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(3, minmax(0, 1fr))',
                },
                gap: 2,
              }}
            >
              {filteredStores.map((store) => (
                <StoreCard key={store.uuid} store={store} />
              ))}
            </Box>
          )}
        </Stack>
      </Container>
    </Box>
  )
}

function StoreDirectoryHeader() {
  const theme = useTheme()

  return (
    <Box
      sx={{
        width: '100%',
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        py: 1,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Container maxWidth="lg">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                component="img"
                src={theme.palette.mode === 'dark' ? '/Scout-logo-icon-light.png' : '/Scout-logo-icon.png'}
                alt="ScoutLGS Logo"
                sx={{ height: 42, width: 'auto', objectFit: 'contain' }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                ScoutLGS
              </Typography>
            </Stack>
          </Link>

          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<ArrowBack fontSize="small" />}
              sx={{ textTransform: 'none' }}
            >
              Home
            </Button>
          </Link>
        </Stack>
      </Container>
    </Box>
  )
}

function StoreCard({ store }: { store: StoreDirectoryEntry }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
      <Link
        to="/stores/$slug"
        params={{ slug: store.slug }}
        style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
      >
        <CardActionArea sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <StoreAvatar store={store} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap title={store.displayName}>
                  {store.displayName}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap title={store.baseUrl}>
                  {store.baseUrl.replace(/^https?:\/\//, '')}
                </Typography>
              </Box>
            </Stack>

            <Divider />

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip
                size="small"
                color={store.isActive ? 'success' : 'default'}
                variant={store.isActive ? 'filled' : 'outlined'}
                label={store.isActive ? 'Active' : 'Inactive'}
              />
              <Chip size="small" variant="outlined" label={formatValue(store.platformType)} />
              <Chip size="small" variant="outlined" label={formatValue(store.scraperType)} />
            </Stack>
          </Stack>
        </CardActionArea>
      </Link>
      <Divider />
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {store.rateLimitPerSecond}/sec
        </Typography>
        <IconButton
          component="a"
          href={store.baseUrl}
          target="_blank"
          rel="noreferrer"
          size="small"
          aria-label={`Open ${store.displayName}`}
        >
          <OpenInNew fontSize="small" />
        </IconButton>
      </Stack>
    </Card>
  )
}

function StoreAvatar({ store }: { store: StoreDirectoryEntry }) {
  if (store.logoUrl) {
    return (
      <Avatar
        src={store.logoUrl}
        alt={`${store.displayName} logo`}
        variant="rounded"
        sx={{ width: 48, height: 48, bgcolor: 'background.default' }}
      />
    )
  }

  return (
    <Avatar variant="rounded" sx={{ width: 48, height: 48, bgcolor: 'primary.main' }}>
      <Storefront fontSize="small" />
    </Avatar>
  )
}

function StoreGridSkeleton() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(3, minmax(0, 1fr))',
        },
        gap: 2,
      }}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="rounded" width={48} height={48} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" />
                <Skeleton width="45%" />
              </Box>
            </Stack>
            <Skeleton />
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rounded" width={72} height={24} />
              <Skeleton variant="rounded" width={92} height={24} />
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Box>
  )
}

function formatValue(value: string | null): string {
  if (!value) return 'Unspecified'

  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
