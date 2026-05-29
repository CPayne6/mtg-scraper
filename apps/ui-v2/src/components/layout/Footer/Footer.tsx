import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { STORE_COUNT, STORE_FACETS } from '@/data/sample';

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 13,
        fontWeight: 600,
        color: 'text.secondary',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        mb: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

function FooterLink({
  children,
  href,
  external,
}: {
  children: React.ReactNode;
  href: string;
  external?: boolean;
}) {
  return (
    <Box
      component="a"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      sx={{
        display: 'block',
        fontSize: 14,
        color: 'text.primary',
        py: 0.5,
        cursor: 'pointer',
        textDecoration: 'none',
        '&:hover': { color: 'primary.main', textDecoration: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

export function Footer() {
  return (
    <Box
      component="footer"
      sx={(theme) => ({
        borderTop: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
        py: { xs: 3, md: 4 },
        px: { xs: 2, md: 3 },
      })}
    >
      <Box
        sx={{
          maxWidth: 1100,
          mx: 'auto',
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr' },
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em', mb: 1.25 }}>
            ScoutLGS
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: 12, maxWidth: 320, lineHeight: 1.5 }}
          >
            ScoutLGS is independent. We do not sell cards. We point you to {STORE_COUNT} game
            stores that do.
          </Typography>
        </Box>
        <Box>
          <FooterHeading>Product</FooterHeading>
          <Stack>
            <FooterLink href="/">Search</FooterLink>
            <FooterLink href="/?mode=deck">List scout</FooterLink>
            <FooterLink href="/lists">Saved lists</FooterLink>
            <FooterLink href="/settings">Settings</FooterLink>
          </Stack>
        </Box>
        <Box>
          <FooterHeading>Stores</FooterHeading>
          <Stack>
            {STORE_FACETS.map((store) => (
              <FooterLink key={store.key} href={store.baseUrl} external>
                {store.label}
              </FooterLink>
            ))}
          </Stack>
        </Box>
        <Box>
          <FooterHeading>Account</FooterHeading>
          <Stack>
            <FooterLink href="/login">Sign in</FooterLink>
            <FooterLink href="/signup">Create account</FooterLink>
            <FooterLink href="https://github.com/CPayne6/mtg-scraper/issues" external>
              Contact
            </FooterLink>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
