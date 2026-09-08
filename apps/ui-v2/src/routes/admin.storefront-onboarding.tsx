import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AdminGate } from '@/components/auth/AdminGate';
import {
  activateStore,
  approveStorefrontOnboardingRun,
  getStorefrontOnboardingRun,
  type OnboardedStore,
  type StorefrontOnboardingRun,
} from '@/api/storefront-onboarding';

export const Route = createFileRoute('/admin/storefront-onboarding')({
  component: () => <AdminGate><StorefrontOnboardingRoute /></AdminGate>,
  validateSearch: (search: Record<string, unknown>) => ({
    runId: typeof search.runId === 'number' && Number.isInteger(search.runId) ? search.runId : undefined,
  }),
});

function StorefrontOnboardingRoute() {
  const { runId } = Route.useSearch();
  const [run, setRun] = useState<StorefrontOnboardingRun | null>(null);
  const [store, setStore] = useState<OnboardedStore | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!runId) return;
    getStorefrontOnboardingRun(runId)
      .then(setRun)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load onboarding run.'));
  }, [runId]);

  const approve = async () => {
    if (!run?.digest) return;
    setBusy(true);
    setError(null);
    try {
      const approvedStore = await approveStorefrontOnboardingRun(run.id, run.digest);
      setStore(approvedStore);
      setRun({ ...run, status: 'approved', approvedStoreId: approvedStore.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to approve this store.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!store) return;
    setBusy(true);
    setError(null);
    try {
      setStore(await activateStore(store.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to activate this store.');
    } finally {
      setBusy(false);
    }
  };

  const proposalReady = run?.status === 'proposal-ready' && Boolean(run.digest);
  const report = run?.report as { validation?: { valid?: boolean; coverage?: number }; diagnostics?: { identity?: { failures?: number } } } | undefined;

  return (
    <Container maxWidth={false} sx={{ maxWidth: 980 }}>
      <Stack spacing={3}>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 0.5 }}>Administration</Typography>
          <Typography variant="h2">Storefront review</Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.75 }}>Review an integration before it is added.</Typography>
        </Box>
        {error && <Alert severity="error" sx={{ borderRadius: 1.5 }}>{error}</Alert>}
        {!run && !error && <Alert severity="info" sx={{ borderRadius: 1.5 }}>Choose Add store from Supported stores to begin.</Alert>}
        {busy && <LinearProgress sx={{ height: 4, borderRadius: 999 }} />}
        {run && <Paper sx={{ borderRadius: 3, boxShadow: 2, p: { xs: 3, md: 4 } }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="h5">Run #{run.id}</Typography>
              <Chip size="small" label={run.status} color={proposalReady ? 'success' : run.status === 'rejected' ? 'error' : 'default'} />
            </Stack>
            {report?.validation && <Typography variant="body2" color="text.secondary">Structural validation: {report.validation.valid ? 'passed' : 'failed'}{typeof report.validation.coverage === 'number' ? ` (${Math.round(report.validation.coverage * 100)}% coverage)` : ''}.</Typography>}
            {typeof report?.diagnostics?.identity?.failures === 'number' && <Typography variant="body2" color="text.secondary">Identity review findings: {report.diagnostics.identity.failures}.</Typography>}
            <Box component="pre" sx={{ m: 0, p: 2, maxHeight: 440, overflow: 'auto', borderRadius: 1.5, bgcolor: 'background.default', border: (theme) => `1px solid ${theme.palette.divider}`, fontSize: 12 }}>
              {JSON.stringify(run.proposal ?? run.report, null, 2)}
            </Box>
            {proposalReady && <Alert severity="warning" sx={{ borderRadius: 1.5 }}>Activation remains a separate action.</Alert>}
            {proposalReady && <Box><Button variant="contained" color="success" disabled={busy} onClick={() => void approve()}>Approve store</Button></Box>}
          </Stack>
        </Paper>}
        {store && <Alert severity={store.isActive ? 'success' : 'info'} sx={{ borderRadius: 1.5 }} action={!store.isActive ? <Button color="inherit" size="small" disabled={busy} onClick={() => void activate()}>Activate</Button> : undefined}>
          {store.displayName ?? store.name} was created with ID {store.id}.{store.isActive ? ' It is active.' : ' It remains inactive until activated.'}
        </Alert>}
      </Stack>
    </Container>
  );
}
