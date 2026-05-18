import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { useColorMode } from '@/components/ui/color-mode';
import { CartIconButton } from '@/components/cart/CartIconButton';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { SkryfallAutocomplete } from '@/components/search/SkryfallAutocomplete';

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colorMode } = useColorMode();
  const isCompactBp = useMediaQuery('(max-width: 720px)');

  const path = location.pathname;
  const isListsActive = path === '/lists' || path.startsWith('/list/');
  const isHome = path === '/';

  const logoSrc = colorMode === 'dark' ? '/logo-mark-light.png' : '/logo-mark.png';

  const handleSearch = (name: string) => {
    if (!name.trim()) return;
    navigate({ to: '/card/$name', params: { name: name.trim() } });
  };

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar
        sx={{
          maxWidth: 1100,
          width: '100%',
          mx: 'auto',
          gap: 4,
          px: { xs: 2, md: 3 },
          minHeight: 64,
        }}
      >
        <Box
          onClick={() => navigate({ to: '/' })}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, cursor: 'pointer' }}
        >
          <Box
            component="img"
            src={logoSrc}
            alt=""
            sx={{ width: 44, height: 44, objectFit: 'contain' }}
          />
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
            ScoutLGS
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            onClick={() => navigate({ to: '/lists' })}
            disableRipple
            sx={(theme) => ({
              px: 1.75,
              py: 1,
              borderRadius: '8px',
              fontSize: 14,
              fontWeight: 500,
              minWidth: 0,
              whiteSpace: 'nowrap',
              color: isListsActive ? 'primary.main' : 'text.secondary',
              bgcolor: isListsActive
                ? theme.palette.mode === 'dark'
                  ? 'rgba(36,135,33,0.18)'
                  : 'rgba(74,103,65,0.10)'
                : 'transparent',
              transition: 'background 200ms, color 200ms',
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.14)'
                    : 'rgba(74,103,65,0.06)',
                color: isListsActive ? 'primary.main' : 'text.primary',
              },
            })}
          >
            Card Lists
          </Button>
        </Box>

        {!isHome && !isCompactBp && (
          <Box sx={{ width: 260, flexShrink: 1 }}>
            <SkryfallAutocomplete
              size="small"
              placeholder="Scout a card…"
              onSelect={handleSearch}
              onSubmit={handleSearch}
            />
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CartIconButton />
          <ProfileMenu />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
