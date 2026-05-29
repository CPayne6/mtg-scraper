import { lazy, Suspense } from 'react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import { TopNav } from '@/components/layout/TopNav';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import('@tanstack/react-router-devtools').then((res) => ({
        default: res.TanStackRouterDevtools,
      })),
    );

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ErrorBoundary>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          color: 'text.primary',
          overflowX: 'hidden',
        }}
      >
        <TopNav />
        <Box component="main" sx={{ flex: 1, py: { xs: 3, md: 5 }, px: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
        <Footer />
        <CartDrawer />
        <Suspense fallback={null}>
          <TanStackRouterDevtools />
        </Suspense>
      </Box>
    </ErrorBoundary>
  );
}
