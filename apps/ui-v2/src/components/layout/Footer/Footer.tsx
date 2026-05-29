import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';

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

function FooterLink({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="a"
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
            ScoutLGS is independent. We don't sell cards — we point you to seven Greater Toronto game
            stores that do.
          </Typography>
        </Box>
        <Box>
          <FooterHeading>Product</FooterHeading>
          <Stack>
            <FooterLink>Search</FooterLink>
            <FooterLink>List scout</FooterLink>
          </Stack>
        </Box>
        <Box>
          <FooterHeading>Stores</FooterHeading>
          <Stack>
            <FooterLink>Face to Face</FooterLink>
            <FooterLink>401 Games</FooterLink>
            <FooterLink>Hobbiesville</FooterLink>
            <FooterLink>See all 7 →</FooterLink>
          </Stack>
        </Box>
        <Box>
          <FooterHeading>About</FooterHeading>
          <Stack>
            <FooterLink>How it works</FooterLink>
            <FooterLink>Why local</FooterLink>
            <FooterLink>Contact</FooterLink>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
