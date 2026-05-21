import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';
import { SnackbarProvider } from 'notistack';
import { Provider } from './components/ui/provider';
import { CartProvider } from './components/cart/CartContext';
import { ListsProvider } from './components/lists/ListsContext';
import { AuthProvider } from './components/auth/AuthContext';

import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Provider>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          autoHideDuration={3000}
        >
          <AuthProvider>
            <ListsProvider>
              <CartProvider>
                <RouterProvider router={router} />
              </CartProvider>
            </ListsProvider>
          </AuthProvider>
        </SnackbarProvider>
      </Provider>
    </ThemeProvider>
  </StrictMode>,
);
