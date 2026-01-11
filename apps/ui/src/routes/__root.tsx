import { lazy, Suspense } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import { ColorModeButton } from '@/components/ui/color-mode'
import Box from '@mui/material/Box'

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import('@tanstack/react-router-devtools').then((res) => ({
        default: res.TanStackRouterDevtools,
      }))
    )

export const Route = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <Box sx={{ position: 'relative', minHeight: '100vh' }}>
        <Box
          sx={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          <ColorModeButton />
        </Box>
        <Outlet />
        <Suspense>
          <TanStackRouterDevtools />
        </Suspense>
      </Box>
    </ErrorBoundary>
  ),
})
