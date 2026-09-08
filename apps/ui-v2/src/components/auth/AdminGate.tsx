import { useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from './AuthContext';

export function AdminGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { session, status } = useAuth();
  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    if (status !== 'loading' && !isAdmin) navigate({ to: '/' });
  }, [isAdmin, navigate, status]);

  if (status === 'loading') {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 280 }}><CircularProgress /></Box>;
  }
  if (!isAdmin) return null;
  return <>{children}</>;
}
