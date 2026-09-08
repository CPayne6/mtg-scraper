import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { fetchAdminStores } from '@/api/admin-stores';
import { createStorefrontOnboardingRun } from '@/api/storefront-onboarding';

export const Route = createFileRoute('/admin/stores/')({
  component: StoresRoute,
});

function StoresRoute() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [proposedSlug, setProposedSlug] = useState('');
  const [scope, setScope] = useState('');
  const [currency, setCurrency] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    fetchAdminStores().then(setStores).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load stores.')).finally(() => setLoading(false));
  }, []);

  const startOnboarding = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const run = await createStorefrontOnboardingRun({
        url: url.trim(),
        ...(proposedSlug.trim() ? { proposedSlug: proposedSlug.trim() } : {}),
        ...(scope.trim() ? { scope: scope.trim() } : {}),
        ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}),
      });
      setDialogOpen(false);
      navigate({ to: '/admin/storefront-onboarding', search: { runId: run.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start onboarding.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 980 }}>
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Button startIcon={<ArrowBack />} size="small" onClick={() => navigate({ to: '/admin/' })} sx={{ mb: 1 }}>Admin tools</Button>
            <Typography variant="h2">Stores</Typography>
            <Typography sx={{ color: 'text.secondary', mt: 0.75 }}>Supported store integrations.</Typography>
          </Box>
          <Button variant="contained" startIcon={<Add />} onClick={() => { setError(null); setDialogOpen(true); }}>Add store</Button>
        </Box>
        {loading && <LinearProgress sx={{ height: 4, borderRadius: 999 }} />}
        {error && <Alert severity="error" sx={{ borderRadius: 1.5 }}>{error}</Alert>}
        {!loading && !error && <Paper sx={{ borderRadius: 3, boxShadow: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table aria-label="Supported stores">
              <TableHead><TableRow>
                <TableCell>Store</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Platform</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Scraper</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">Rate</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {stores.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((store) => <TableRow hover key={store.id} onClick={() => navigate({ to: '/admin/stores/$storeId', params: { storeId: String(store.id) } })} sx={{ cursor: 'pointer' }}>
                  <TableCell><Typography sx={{ fontWeight: 600 }}>{store.displayName}</Typography><Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 360 }}>{store.baseUrl}</Typography></TableCell>
                  <TableCell><Chip size="small" label={store.isActive ? 'Active' : 'Inactive'} color={store.isActive ? 'success' : 'default'} /></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Chip size="small" variant="outlined" label={store.platformType ?? 'Legacy'} /></TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{store.scraperType}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{store.rateLimitPerSecond}/sec</TableCell>
                </TableRow>)}
                {!stores.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No supported stores yet.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={stores.length} page={page} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} />
        </Paper>}
        <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Add store</DialogTitle>
          <DialogContent><Stack spacing={2.25} sx={{ pt: 1 }}>
            <TextField label="Store URL" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/" autoFocus fullWidth />
            <TextField label="Proposed slug" value={proposedSlug} onChange={(event) => setProposedSlug(event.target.value)} helperText="Optional — leave blank to use the detected value." fullWidth />
            <TextField label="Catalog scope" value={scope} onChange={(event) => setScope(event.target.value)} helperText="Optional — leave blank to use the detected value." multiline minRows={2} fullWidth />
            <TextField label="Store currency" value={currency} onChange={(event) => setCurrency(event.target.value)} helperText="Required when the detected platform does not expose currency (including Conduct Commerce)." inputProps={{ maxLength: 3 }} fullWidth />
          </Stack></DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}><Button disabled={submitting} onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="contained" disabled={submitting || !url.trim()} onClick={() => void startOnboarding()}>Continue</Button></DialogActions>
        </Dialog>
      </Stack>
    </Container>
  );
}
