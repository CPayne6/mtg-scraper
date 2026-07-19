import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useColorMode } from '@/components/ui/color-mode';
import type { EmptyStateProps } from './EmptyState.types';

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const { colorMode } = useColorMode();
  const logo = colorMode === 'dark' ? '/logo-mark-light.png' : '/logo-mark.png';

  return (
    <Paper
      sx={{
        py: 7,
        px: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 480 }}>
        {icon ? (
          <Box sx={{ opacity: 0.85 }}>{icon}</Box>
        ) : (
          <Box
            component="img"
            src={logo}
            alt=""
            sx={{ width: 88, height: 88, opacity: 0.85 }}
          />
        )}
        <Typography variant="h5">{title}</Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
            {description}
          </Typography>
        )}
        {action && <Box sx={{ mt: 1 }}>{action}</Box>}
      </Stack>
    </Paper>
  );
}
