import { createFileRoute, Link } from '@tanstack/react-router'
import { CardDisplay } from '../components/CardDisplay/CardDisplay'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Suspense } from 'react'

export const Route = createFileRoute('/card/$name')({
  component: CardPage,
})

function CardPage() {
  const { name } = Route.useParams()
  const decodedName = decodeURIComponent(name)

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
        px: { xs: 2, sm: 3, md: 4 },
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: 1
      }}>
        <Box sx={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              component="img"
              src="/scanner.png"
              alt="logo"
              sx={{
                height: { xs: 60, md: 80 },
                width: { xs: 60, md: 80 },
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
                Browse Cards
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
          <Button
            component={Link}
            to="/"
            variant="outlined"
            size="medium"
            sx={{ minWidth: { xs: '100%', sm: 'auto' } }}
          >
            Back to Home
          </Button>
        </Box>
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
            <Typography variant="h6" color="text.secondary">Loading...</Typography>
          </Box>
        }>
          <CardDisplay cardName={decodedName} />
        </Suspense>
      </Box>
    </Box>
  )
}
