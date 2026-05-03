import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormHelperText,
  FormLabel,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import OpenInNew from '@mui/icons-material/OpenInNew'
import RestartAlt from '@mui/icons-material/RestartAlt'
import Search from '@mui/icons-material/Search'
import { searchTokens } from '@/api/tokens'
import type { TokenListingResult, TokenSearchParams, TokenSearchResponse } from '@/api/tokens'
import { ConditionFilter, ConditionFilterSkeleton } from '@/components/ConditionFilter'
import { Image } from '@/components/Image'
import { PageLayout } from '@/components/PageLayout'
import { SavedDecklistsMenu } from '@/components/SavedDecklistsMenu'
import { StoreFilter, StoreFilterSkeleton } from '@/components/StoreFilter'

export const Route = createFileRoute('/tokens')({
  component: TokensPage,
})

const PAGE_SIZE = 48
const COLOR_OPTIONS = ['W', 'U', 'B', 'R', 'G']
const TYPE_OPTIONS = ['', 'Creature', 'Artifact', 'Enchantment', 'Emblem', 'Card']

interface TokenSearchFormState {
  name: string
  type: string
  subtype: string
  power: string
  toughness: string
  colors: string[]
  setCode: string
}

const EMPTY_FORM: TokenSearchFormState = {
  name: '',
  type: '',
  subtype: '',
  power: '',
  toughness: '',
  colors: [],
  setCode: '',
}

function normalizeForm(form: TokenSearchFormState): TokenSearchFormState {
  return {
    name: form.name.trim(),
    type: form.type.trim(),
    subtype: form.subtype.trim(),
    power: form.power.trim(),
    toughness: form.toughness.trim(),
    colors: [...form.colors],
    setCode: form.setCode.trim(),
  }
}

function hasSearchCriteria(form: TokenSearchFormState): boolean {
  return Boolean(
    form.name ||
    form.type ||
    form.subtype ||
    form.power ||
    form.toughness ||
    form.colors.length > 0 ||
    form.setCode,
  )
}

function buildTokenSearchParams(
  form: TokenSearchFormState,
  selectedStores: string[],
  selectedConditions: string[],
  page: number,
): TokenSearchParams {
  return {
    name: form.name,
    type: form.type,
    subtype: form.subtype,
    power: form.power,
    toughness: form.toughness,
    colors: form.colors.length > 0 ? form.colors.join(',') : undefined,
    setCode: form.setCode,
    stores: selectedStores,
    conditions: selectedConditions,
    page,
    limit: PAGE_SIZE,
  }
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(price)
  } catch {
    return `${currency || '$'} ${price.toFixed(2)}`
  }
}

function formatColors(colors: string): string {
  return colors ? colors.split(',').join(' ') : 'Colorless'
}

function TokensPage() {
  const theme = useTheme()
  const [draft, setDraft] = useState<TokenSearchFormState>(EMPTY_FORM)
  const [submitted, setSubmitted] = useState<TokenSearchFormState | null>(null)
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [selectedConditions, setSelectedConditions] = useState<string[]>([])
  const [results, setResults] = useState<TokenListingResult[]>([])
  const [data, setData] = useState<TokenSearchResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const statsCurrency = results[0]?.currency ?? 'CAD'

  useEffect(() => {
    if (!submitted) return

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setPage(1)

    searchTokens(
      buildTokenSearchParams(submitted, selectedStores, selectedConditions, 1),
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return
        setData(response)
        setResults(response.results)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setData(null)
        setResults([])
        setError(err instanceof Error ? err.message : 'Unable to search tokens')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [submitted, selectedStores, selectedConditions])

  useEffect(() => {
    return () => loadMoreControllerRef.current?.abort()
  }, [])

  const activeSearchLabels = useMemo(() => {
    if (!submitted) return []

    return [
      submitted.name ? `Name: ${submitted.name}` : null,
      submitted.type ? `Type: ${submitted.type}` : null,
      submitted.subtype ? `Subtype: ${submitted.subtype}` : null,
      submitted.power ? `Power: ${submitted.power}` : null,
      submitted.toughness ? `Toughness: ${submitted.toughness}` : null,
      submitted.colors.length > 0 ? `Colors: ${submitted.colors.join(' ')}` : null,
      submitted.setCode ? `Set: ${submitted.setCode}` : null,
    ].filter((label): label is string => Boolean(label))
  }, [submitted])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalized = normalizeForm(draft)
    if (!hasSearchCriteria(normalized)) {
      setFormError('Enter at least one token search value')
      return
    }

    setFormError(null)
    setSelectedStores([])
    setSelectedConditions([])
    setSubmitted(normalized)
  }

  const handleClear = () => {
    loadMoreControllerRef.current?.abort()
    setDraft(EMPTY_FORM)
    setSubmitted(null)
    setSelectedStores([])
    setSelectedConditions([])
    setResults([])
    setData(null)
    setPage(1)
    setError(null)
    setFormError(null)
  }

  const handleLoadMore = useCallback(async () => {
    if (!submitted || !data?.pagination.hasNextPage || loadingMore) return

    loadMoreControllerRef.current?.abort()
    const controller = new AbortController()
    loadMoreControllerRef.current = controller
    const nextPage = page + 1

    setLoadingMore(true)
    setError(null)

    try {
      const response = await searchTokens(
        buildTokenSearchParams(submitted, selectedStores, selectedConditions, nextPage),
        controller.signal,
      )

      if (controller.signal.aborted) return

      setResults((previous) => [...previous, ...response.results])
      setData(response)
      setPage(nextPage)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Unable to load more tokens')
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMore(false)
      }
    }
  }, [data?.pagination.hasNextPage, loadingMore, page, selectedConditions, selectedStores, submitted])

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      width: '100%',
      bgcolor: 'background.default',
    }}>
      <Box sx={{
        width: '100%',
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        py: { xs: 1, md: 1.5 },
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: 1,
      }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            width: '100%',
            maxWidth: '1400px',
            margin: '0 auto',
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ cursor: 'pointer', width: 'fit-content' }}>
              <Box
                component="img"
                src={theme.palette.mode === 'dark' ? '/Scout-logo-icon-light.png' : '/Scout-logo-icon.png'}
                alt="ScoutLGS Logo"
                sx={{
                  height: { xs: 40, md: 50 },
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
              <Stack spacing={0}>
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: '1.25rem', md: '1.5rem' },
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  ScoutLGS
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    display: { xs: 'none', sm: 'block' },
                    fontSize: '0.75rem',
                    lineHeight: 1.2,
                  }}
                >
                  Token search
                </Typography>
              </Stack>
            </Stack>
          </Link>
          <SavedDecklistsMenu />
        </Stack>
      </Box>

      <Box sx={{
        width: '100%',
        px: { xs: 2, sm: 3, md: 4, lg: 2 },
        py: { xs: 3, md: 4 },
        flex: 1,
      }}>
        <PageLayout showAds={true}>
          <Stack spacing={3}>
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 2,
                boxShadow: 1,
                p: { xs: 2, md: 3 },
              }}
            >
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 600 }}>
                      Token Search
                    </Typography>
                    {submitted && (
                      <Typography variant="body2" color="text.secondary">
                        {data ? `${results.length} / ${data.totalListings} listings` : 'Searching tokens'}
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1} justifyContent={{ xs: 'stretch', sm: 'flex-end' }}>
                    <Button
                      type="button"
                      variant="outlined"
                      startIcon={<RestartAlt />}
                      onClick={handleClear}
                      sx={{ textTransform: 'none', flex: { xs: 1, sm: 'initial' } }}
                    >
                      Clear
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={<Search />}
                      sx={{ textTransform: 'none', flex: { xs: 1, sm: 'initial' } }}
                    >
                      Search
                    </Button>
                  </Stack>
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' },
                    gap: 2,
                  }}
                >
                  <TextField
                    label="Token name"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    sx={{ gridColumn: { xs: '1', md: 'span 2', lg: 'span 2' } }}
                  />
                  <TextField
                    select
                    label="Type"
                    value={draft.type}
                    onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
                  >
                    {TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option || 'any'} value={option}>
                        {option || 'Any'}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Subtype"
                    value={draft.subtype}
                    onChange={(event) => setDraft((current) => ({ ...current, subtype: event.target.value }))}
                  />
                  <TextField
                    label="Power"
                    value={draft.power}
                    onChange={(event) => setDraft((current) => ({ ...current, power: event.target.value }))}
                  />
                  <TextField
                    label="Toughness"
                    value={draft.toughness}
                    onChange={(event) => setDraft((current) => ({ ...current, toughness: event.target.value }))}
                  />
                  <TextField
                    label="Set"
                    value={draft.setCode}
                    onChange={(event) => setDraft((current) => ({ ...current, setCode: event.target.value }))}
                  />
                  <FormControl sx={{ gridColumn: { xs: '1', md: 'span 3', lg: 'span 2' } }}>
                    <FormLabel sx={{ mb: 1 }}>Colors</FormLabel>
                    <ToggleButtonGroup
                      value={draft.colors}
                      onChange={(_, selectedColors) => {
                        if (Array.isArray(selectedColors)) {
                          setDraft((current) => ({ ...current, colors: selectedColors }))
                        }
                      }}
                      size="small"
                      sx={{ flexWrap: 'wrap', gap: 1 }}
                    >
                      {COLOR_OPTIONS.map((color) => (
                        <ToggleButton key={color} value={color} sx={{ width: 42, height: 40 }}>
                          {color}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                    {formError && <FormHelperText error>{formError}</FormHelperText>}
                  </FormControl>
                </Box>

                {activeSearchLabels.length > 0 && (
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {activeSearchLabels.map((label) => (
                      <Chip key={label} label={label} size="small" />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Box>

            {error && (
              <Alert severity="error">{error}</Alert>
            )}

            {submitted ? (
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, width: '100%' }}>
                <Box sx={{ width: { xs: '100%', md: '220px' }, flexShrink: 0, position: { md: 'sticky' }, top: { md: 120 }, alignSelf: 'flex-start' }}>
                  <Stack spacing={2}>
                    {loading && !data ? (
                      <>
                        <StoreFilterSkeleton />
                        <ConditionFilterSkeleton />
                      </>
                    ) : data ? (
                      <>
                        <StoreFilter
                          storeCounts={data.storeCounts}
                          selectedSlugs={selectedStores}
                          onStoresChange={setSelectedStores}
                          itemLabel="tokens"
                        />
                        <ConditionFilter
                          conditionCounts={data.conditionCounts}
                          selectedConditions={selectedConditions}
                          onConditionsChange={setSelectedConditions}
                          itemLabel="tokens"
                        />
                      </>
                    ) : null}
                  </Stack>
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack spacing={2}>
                    {data && (
                      <Box
                        sx={{
                          bgcolor: 'background.paper',
                          borderRadius: 2,
                          boxShadow: 1,
                          p: { xs: 2, md: 2.5 },
                          display: 'flex',
                          alignItems: { xs: 'flex-start', sm: 'center' },
                          justifyContent: 'space-between',
                          gap: 2,
                          flexDirection: { xs: 'column', sm: 'row' },
                        }}
                      >
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            Results
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {results.length} / {data.totalListings} listings
                          </Typography>
                        </Box>
                        {data.totalListings > 0 && (
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Chip label={`Min ${formatPrice(data.priceStats.min, statsCurrency)}`} size="small" />
                            <Chip label={`Max ${formatPrice(data.priceStats.max, statsCurrency)}`} size="small" />
                            <Chip label={`Avg ${formatPrice(data.priceStats.avg, statsCurrency)}`} size="small" />
                          </Stack>
                        )}
                      </Box>
                    )}

                    {loading && results.length === 0 ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress />
                      </Box>
                    ) : data && results.length === 0 ? (
                      <Box
                        sx={{
                          bgcolor: 'background.paper',
                          borderRadius: 2,
                          boxShadow: 1,
                          py: 8,
                          px: 2,
                          textAlign: 'center',
                        }}
                      >
                        <Typography variant="h6" color="text.secondary">
                          No token listings found
                        </Typography>
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                          gap: { xs: 2, md: 3 },
                          alignItems: 'stretch',
                        }}
                      >
                        {results.map((token) => (
                          <TokenResultCard key={token.id} token={token} />
                        ))}
                      </Box>
                    )}

                    {data?.pagination.hasNextPage && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <Button
                          variant="outlined"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          sx={{ textTransform: 'none' }}
                        >
                          {loadingMore ? 'Loading...' : 'Load more'}
                        </Button>
                      </Box>
                    )}
                  </Stack>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  bgcolor: 'background.paper',
                  borderRadius: 2,
                  boxShadow: 1,
                  py: 8,
                  px: 2,
                  textAlign: 'center',
                }}
              >
                <Typography variant="h6" color="text.secondary">
                  No token search yet
                </Typography>
              </Box>
            )}
          </Stack>
        </PageLayout>
      </Box>
    </Box>
  )
}

function TokenResultCard({ token }: { token: TokenListingResult }) {
  const imageSrc = token.imageUri ?? token.imageUrl
  const setLabel = [token.setCode?.toUpperCase(), token.collectorNumber ? `#${token.collectorNumber}` : null]
    .filter(Boolean)
    .join(' ')
  const powerToughness = token.power || token.toughness ? `${token.power || '?'}/${token.toughness || '?'}` : null

  return (
    <MuiCard
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        boxShadow: 2,
      }}
    >
      <Box sx={{
        width: '100%',
        bgcolor: 'background.default',
        aspectRatio: '5/7',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={`${token.tokenName} ${setLabel}`}
            style={{ borderRadius: '8px' }}
          />
        ) : (
          <Box sx={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            textAlign: 'center',
          }}>
            <Typography variant="body2" color="text.secondary">
              No image
            </Typography>
          </Box>
        )}
      </Box>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        <Box>
          <Typography
            variant="h6"
            title={token.tokenName}
            sx={{
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1.25,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {token.tokenName}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            title={token.typeLine}
            sx={{
              minHeight: '2.5rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {token.typeLine || 'Token'}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          <Chip label={setLabel || 'Unknown set'} size="small" />
          <Chip label={formatColors(token.colors)} size="small" />
          {powerToughness && <Chip label={powerToughness} size="small" />}
          <Chip label={token.foil ? 'Foil' : 'Nonfoil'} size="small" color={token.foil ? 'secondary' : 'default'} />
          <Chip label={`Qty ${token.quantity ?? 0}`} size="small" />
          <Chip label={token.condition.toUpperCase()} size="small" />
        </Stack>

        <Box sx={{ mt: 'auto' }}>
          <Typography variant="body2" color="text.secondary">
            {token.setName || token.setCode.toUpperCase()}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            {formatPrice(token.price, token.currency)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {token.store}
          </Typography>
        </Box>
      </CardContent>
      <CardActions sx={{ p: 2, pt: 0 }}>
        <Button
          href={token.productLink}
          target="_blank"
          rel="noreferrer"
          variant="contained"
          size="small"
          endIcon={<OpenInNew />}
          fullWidth
          sx={{ textTransform: 'none' }}
        >
          View product
        </Button>
      </CardActions>
    </MuiCard>
  )
}
