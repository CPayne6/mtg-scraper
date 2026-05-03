import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Home from '@mui/icons-material/Home'
import OpenInNew from '@mui/icons-material/OpenInNew'
import Storefront from '@mui/icons-material/Storefront'
import { fetchStore, type StoreDirectoryEntry } from '@/utils/storesApi'

export const Route = createFileRoute('/stores/$slug')({
  component: StoreDetailPage,
})

function StoreDetailPage() {
  const { slug } = Route.useParams()
  const [store, setStore] = useState<StoreDirectoryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    fetchStore(slug, controller.signal)
      .then((data) => {
        setStore(data)
        setLoading(false)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('Store not found.')
        setLoading(false)
      })

    return () => controller.abort()
  }, [slug])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <StoreDetailHeader />

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        {loading ? (
          <StoreDetailSkeleton />
        ) : error || !store ? (
          <Stack spacing={2}>
            <Alert severity="error">{error ?? 'Store not found.'}</Alert>
            <Link to="/stores" style={{ textDecoration: 'none' }}>
              <Button variant="outlined" startIcon={<ArrowBack fontSize="small" />} sx={{ textTransform: 'none' }}>
                Back to Stores
              </Button>
            </Link>
          </Stack>
        ) : (
          <StoreDetail store={store} />
        )}
      </Container>
    </Box>
  )
}

function StoreDetailHeader() {
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
      <Container maxWidth="md">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Link to="/stores" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                component="img"
                src={theme.palette.mode === 'dark' ? '/Scout-logo-icon-light.png' : '/Scout-logo-icon.png'}
                alt="ScoutLGS Logo"
                sx={{ height: 42, width: 'auto', objectFit: 'contain' }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Stores
              </Typography>
            </Stack>
          </Link>

          <Stack direction="row" spacing={1}>
            <Link to="/stores" style={{ textDecoration: 'none' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ArrowBack fontSize="small" />}
                sx={{ textTransform: 'none' }}
              >
                Stores
              </Button>
            </Link>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Home fontSize="small" />}
                sx={{ textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
              >
                Home
              </Button>
            </Link>
          </Stack>
        </Stack>
      </Container>
    </Box>
  )
}

function StoreDetail({ store }: { store: StoreDirectoryEntry }) {
  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2.5}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <StoreAvatar store={store} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.15 }} title={store.displayName}>
                {store.displayName}
              </Typography>
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {store.baseUrl.replace(/^https?:\/\//, '')}
              </Typography>
            </Box>
          </Stack>

          <Button
            component="a"
            href={store.baseUrl}
            target="_blank"
            rel="noreferrer"
            variant="contained"
            endIcon={<OpenInNew fontSize="small" />}
            sx={{ textTransform: 'none' }}
          >
            Open Site
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mt: 3 }}>
          <Chip
            color={store.isActive ? 'success' : 'default'}
            variant={store.isActive ? 'filled' : 'outlined'}
            label={store.isActive ? 'Active' : 'Inactive'}
          />
          <Chip variant="outlined" label={`Platform: ${formatValue(store.platformType)}`} />
          <Chip variant="outlined" label={`Scraper: ${formatValue(store.scraperType)}`} />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Stack divider={<Divider />}>
          <MetadataRow label="Slug" value={store.slug} />
          <MetadataRow label="UUID" value={store.uuid} />
          <MetadataRow label="Rate limit" value={`${store.rateLimitPerSecond} requests/sec`} />
          <MetadataRow label="Discovery" value={formatDiscovery(store.discoveryEnabled)} />
          <MetadataRow label="Logo URL" value={store.logoUrl ?? 'Not configured'} />
        </Stack>
      </Paper>
    </Stack>
  )
}

function StoreAvatar({ store }: { store: StoreDirectoryEntry }) {
  if (store.logoUrl) {
    return (
      <Avatar
        src={store.logoUrl}
        alt={`${store.displayName} logo`}
        variant="rounded"
        sx={{ width: 64, height: 64, bgcolor: 'background.default' }}
      />
    )
  }

  return (
    <Avatar variant="rounded" sx={{ width: 64, height: 64, bgcolor: 'primary.main' }}>
      <Storefront />
    </Avatar>
  )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      justifyContent="space-between"
      sx={{ px: { xs: 2, md: 2.5 }, py: 1.5 }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          textAlign: { xs: 'left', sm: 'right' },
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Stack>
  )
}

function StoreDetailSkeleton() {
  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Skeleton variant="rounded" width={64} height={64} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={42} />
            <Skeleton width="35%" />
          </Box>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack spacing={1.5}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} />
          ))}
        </Stack>
      </Paper>
    </Stack>
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

function formatDiscovery(value: boolean | null): string {
  if (value === null) return 'Not configured'
  return value ? 'Enabled' : 'Disabled'
}
