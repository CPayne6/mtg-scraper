import { lazy, Suspense } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import { SavedDecklistsMenu } from '../components/SavedDecklistsMenu'

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
      overflow: 'auto'
    }}>
      <Box sx={{
        width: '100%',
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        py: { xs: 2, md: 3 },
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
            <Stack direction="row" spacing={2} alignItems="center" sx={{ cursor: 'pointer', width: 'fit-content' }}>
              <Box
                component="img"
                src={theme.palette.mode === 'dark' ? '/Scout-logo-icon-light.png' : '/Scout-logo-icon.png'}
                alt="ScoutLGS Logo"
                sx={{
                  height: { xs: 60, md: 80 },
                  width: 'auto',
                  objectFit: 'contain'
                }}
              />
              <Stack>
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: '1.5rem', md: '2rem' },
                    fontWeight: 600
                  }}
                >
                  ScoutLGS
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    display: { xs: 'none', sm: 'block' }
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
        maxWidth: '1400px',
        margin: '0 auto',
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 4 },
        flex: 1
      }}>
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">Loading card list...</Typography>
          </Box>
        }>
          <DeckDisplay key={decodedListName} listName={decodedListName} />
        </Suspense>
      </Box>
    </Box>
  )
}
