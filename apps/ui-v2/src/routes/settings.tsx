import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useColorMode } from '@/components/ui/color-mode';
import { DEFAULT_STORE_KEYS, STORE_FACETS } from '@/data/sample';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getDeliveryAddress, removeDeliveryAddress, saveDeliveryAddress, type DeliveryAddress } from '@/api/auth';
import { useAuth } from '@/components/auth/AuthContext';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Box
      sx={(theme) => ({
        display: 'inline-flex',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        overflow: 'hidden',
      })}
    >
      {options.map((opt, i) => {
        const on = value === opt;
        return (
          <Box
            key={opt}
            component="button"
            onClick={() => onChange(opt)}
            sx={(theme) => ({
              border: 0,
              borderLeft: i > 0 ? `1px solid ${theme.palette.divider}` : 'none',
              bgcolor: on ? 'primary.main' : 'transparent',
              color: on ? '#fff' : 'text.primary',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              px: 1.25,
              py: 0.75,
              transition: 'background 200ms',
              '&:hover': on
                ? {}
                : {
                    bgcolor: theme.palette.surfaceHover,
                  },
            })}
          >
            {opt}
          </Box>
        );
      })}
    </Box>
  );
}

function SettingsRoute() {
  const { colorMode, setColorMode } = useColorMode();
  const { session } = useAuth();
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [addressSaving, setAddressSaving] = useState(false);
  useEffect(() => { if (session?.user) void getDeliveryAddress().then((result) => setAddress(result.address)).catch(() => setAddress(null)); }, [session?.user]);
  const [defaultCondition, setDefaultCondition] = useLocalStorage<string>(
    'scoutlgs:default-condition',
    'LP',
  );
  const [defaultStores, setDefaultStores] = useLocalStorage<string[]>(
    'scoutlgs:default-stores',
    DEFAULT_STORE_KEYS,
  );
  const activeDefaultStores = defaultStores.length > 0 ? defaultStores : DEFAULT_STORE_KEYS;

  const toggleDefaultStore = (storeKey: string) => {
    setDefaultStores((current) => {
      const active = current.length > 0 ? current : DEFAULT_STORE_KEYS;
      if (active.includes(storeKey)) {
        if (active.length === 1) return active;
        return active.filter((key) => key !== storeKey);
      }
      return [...active, storeKey];
    });
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 900 }}>
      <Typography variant="h2" sx={{ mb: 3 }}>
        Settings
      </Typography>
      <Paper sx={{ borderRadius: 3, boxShadow: 2, p: { xs: 3.5, md: 4.5, lg: 5 } }}>
        <Stack spacing={3.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6">Color mode</Typography>
              <Typography variant="body2" color="text.secondary">
                Light is the default; dark mirrors your OS preference.
              </Typography>
            </Box>
            <Segmented
              options={['Light', 'Dark']}
              value={colorMode === 'dark' ? 'Dark' : 'Light'}
              onChange={(v) => setColorMode(v === 'Dark' ? 'dark' : 'light')}
            />
          </Box>

          {session?.user && <Box sx={{ display: 'grid', gap: 1.25 }}>
            <Box>
              <Typography variant="h6">Saved delivery address</Typography>
              <Typography variant="body2" color="text.secondary">Used only when you choose it for a future delivery estimate.</Typography>
            </Box>
            <TextField label="Street address" value={address?.address1 ?? ''} onChange={(event) => setAddress((current) => ({ ...(current ?? { city: '', province: '', postalCode: '', countryCode: 'CA' }), address1: event.target.value }))} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr 1fr' }, gap: 1 }}>
              <TextField label="City" value={address?.city ?? ''} onChange={(event) => setAddress((current) => ({ ...(current ?? { address1: '', province: '', postalCode: '', countryCode: 'CA' }), city: event.target.value }))} />
              <TextField label="Province" value={address?.province ?? ''} onChange={(event) => setAddress((current) => ({ ...(current ?? { address1: '', city: '', postalCode: '', countryCode: 'CA' }), province: event.target.value.toUpperCase() }))} />
              <TextField label="Postal code" value={address?.postalCode ?? ''} onChange={(event) => setAddress((current) => ({ ...(current ?? { address1: '', city: '', province: '', countryCode: 'CA' }), postalCode: event.target.value.toUpperCase() }))} />
            </Box>
            <Stack direction="row" spacing={1}><Button variant="contained" disabled={!address || addressSaving} onClick={() => { if (!address) return; setAddressSaving(true); void saveDeliveryAddress(address).finally(() => setAddressSaving(false)); }}>Save address</Button><Button color="error" disabled={!address || addressSaving} onClick={() => { setAddressSaving(true); void removeDeliveryAddress().then(() => setAddress(null)).finally(() => setAddressSaving(false)); }}>Remove address</Button></Stack>
          </Box>}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6">Default stores</Typography>
              <Typography variant="body2" color="text.secondary">
                Which stores to scout when you search.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {STORE_FACETS.map((store) => {
                const selected = activeDefaultStores.includes(store.key);
                return (
                  <Chip
                    key={store.key}
                    color={selected ? 'success' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    label={store.label}
                    onClick={() => toggleDefaultStore(store.key)}
                  />
                );
              })}
            </Stack>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6">Default condition</Typography>
              <Typography variant="body2" color="text.secondary">
                Lowest accepted condition for prices.
              </Typography>
            </Box>
            <Segmented options={CONDITIONS} value={defaultCondition} onChange={setDefaultCondition} />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6">Currency</Typography>
              <Typography variant="body2" color="text.secondary">
                Prices always shown in Canadian dollars.
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>CAD</Typography>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
