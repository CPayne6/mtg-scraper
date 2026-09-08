import { createFileRoute, useNavigate } from '@tanstack/react-router';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Storefront from '@mui/icons-material/Storefront';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AdminGate } from '@/components/auth/AdminGate';

export const Route = createFileRoute('/admin/')({
  component: () => <AdminGate><AdminToolsRoute /></AdminGate>,
});

function AdminToolsRoute() {
  const navigate = useNavigate();
  return (
    <Container maxWidth={false} sx={{ maxWidth: 980 }}>
      <Stack spacing={3}>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 0.5 }}>Administration</Typography>
          <Typography variant="h2">Admin tools</Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.75 }}>Manage store integrations and related settings.</Typography>
        </Box>
        <Paper sx={{ borderRadius: 3, boxShadow: 2, p: { xs: 3, md: 4 }, maxWidth: 560 }}>
          <Stack spacing={1.5}>
            <Storefront color="primary" />
            <Typography variant="h5">Stores</Typography>
            <Typography variant="body2" color="text.secondary">View and manage supported stores.</Typography>
            <Box><Button endIcon={<ArrowForward />} onClick={() => navigate({ to: '/admin/stores/' })}>Open stores</Button></Box>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
