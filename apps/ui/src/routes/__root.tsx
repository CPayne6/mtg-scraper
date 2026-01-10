import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import { ColorModeButton } from '@/components/ui/color-mode'
import Box from '@mui/material/Box'

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
        <TanStackRouterDevtools />
      </Box>
    </ErrorBoundary>
  ),
})
