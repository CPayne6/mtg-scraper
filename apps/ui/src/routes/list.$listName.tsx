import { lazy, Suspense } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import { SavedDecklistsMenu } from '../components/SavedDecklistsMenu'
import { PageLayout } from '../components/PageLayout'

const DeckDisplay = lazy(() => import('../components/DeckDisplay/DeckDisplay').then(m => ({ default: m.DeckDisplay })))

export const Route = createFileRoute('/list/$listName')({
  component: ListPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      page: search.page as string | undefined,
      name: search.name as string | undefined,
    }
  },
})

function ListPage() {
  const { listName } = Route.useParams()
  const decodedListName = decodeURI(listName)
  const theme = useTheme()

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
        boxShadow: 1
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
                  objectFit: 'contain'
                }}
              />
              <Stack spacing={0}>
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: '1.25rem', md: '1.5rem' },
                    fontWeight: 600,
                    lineHeight: 1.2
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
                    lineHeight: 1.2
                  }}
                >
                  Find the cards you want at the best prices
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
        flex: 1
      }}>
        <PageLayout showAds={true}>
          <Suspense fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary">Loading card list...</Typography>
            </Box>
          }>
            <DeckDisplay key={decodedListName} listName={decodedListName} />
          </Suspense>
        </PageLayout>
      </Box>
    </Box>
  )
}
