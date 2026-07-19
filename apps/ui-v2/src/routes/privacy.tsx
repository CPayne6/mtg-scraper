import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

declare global {
  interface Window {
    googlefc?: { showRevocationMessage?: () => void };
  }
}

export const Route = createFileRoute('/privacy')({ component: PrivacyRoute });

function PrivacyRoute() {
  const [settingsAvailable, setSettingsAvailable] = useState(true);
  const openPrivacySettings = () => {
    if (window.googlefc?.showRevocationMessage) {
      window.googlefc.showRevocationMessage();
    } else {
      setSettingsAvailable(false);
    }
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 800 }}>
      <Typography variant="h2" sx={{ mb: 2 }}>Privacy & cookies</Typography>
      <Box sx={{ display: 'grid', gap: 2, color: 'text.secondary', '& p': { m: 0, lineHeight: 1.7 } }}>
        <Typography component="p">
          ScoutLGS helps you compare Magic: The Gathering card offers. We keep account, saved-list,
          cart, and preference data needed to provide those features and improve the service.
        </Typography>
        <Typography component="p">
          When ads are enabled, Google may serve and measure advertisements using cookies or similar
          technologies. Learn how Google uses information from sites and apps that use its services at{' '}
          <Box component="a" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
            Google’s partner-sites information page
          </Box>.
        </Typography>
        <Typography component="p">
          Card offers may link to independent stores. Their sites, checkout processes, and privacy
          practices are their own. ScoutLGS does not sell cards or process store purchases.
        </Typography>
        <Typography component="p">
          For privacy questions or requests, contact us through the ScoutLGS contact channel associated
          with your account or the site’s support contact.
        </Typography>
      </Box>
      <Box sx={{ mt: 4 }}>
        <Button id="privacy-settings" variant="outlined" onClick={openPrivacySettings}>
          Privacy settings
        </Button>
        {!settingsAvailable && (
          <Typography role="status" sx={{ mt: 1, fontSize: 14, color: 'text.secondary' }}>
            Privacy settings are not available until the Google consent message is active.
          </Typography>
        )}
      </Box>
    </Container>
  );
}
