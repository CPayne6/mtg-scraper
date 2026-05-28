import { useState, type MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import ListIcon from '@mui/icons-material/ListAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import DarkMode from '@mui/icons-material/DarkMode';
import LightMode from '@mui/icons-material/LightMode';
import Logout from '@mui/icons-material/Logout';
import { useNavigate } from '@tanstack/react-router';
import { useColorMode } from '@/components/ui/color-mode';
import { useLists } from '@/components/lists/ListsContext';

export function ProfileMenu() {
  const navigate = useNavigate();
  const { count } = useLists();
  const { colorMode, toggleColorMode } = useColorMode();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const handleClose = () => setAnchor(null);

  const go = (path: '/lists' | '/settings') => {
    setAnchor(null);
    navigate({ to: path });
  };

  return (
    <>
      <IconButton
        onClick={handleOpen}
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        sx={{
          width: 38,
          height: 38,
          p: 0,
          border: '1px solid',
          borderColor: 'primary.main',
          bgcolor: 'primary.main',
          color: '#fff',
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': { bgcolor: 'primary.dark', transform: 'translateY(-1px)' },
        }}
      >
        <Avatar
          sx={{
            width: '100%',
            height: '100%',
            bgcolor: 'transparent',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          SC
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 260, mt: 1 } } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.25, py: 1.25 }}>
          <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
            SC
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>Scout Player</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              player@scoutlgs.ca
            </Typography>
          </Box>
        </Box>
        <Divider />
        <MenuItem onClick={() => go('/lists')}>
          <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
            <ListIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Box sx={{ flex: 1 }}>Saved lists</Box>
            <Box
              sx={(theme) => ({
                px: 1,
                py: '1px',
                borderRadius: '999px',
                bgcolor: theme.palette.honey.light,
                color: theme.palette.honey.dark,
                fontSize: '0.7rem',
                fontWeight: 600,
              })}
            >
              {count}
            </Box>
          </Stack>
        </MenuItem>
        <MenuItem onClick={() => go('/settings')}>
          <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
            <SettingsIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Box sx={{ flex: 1 }}>Settings</Box>
          </Stack>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={(e) => {
            e.preventDefault();
            toggleColorMode();
          }}
        >
          <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
            {colorMode === 'dark' ? (
              <LightMode sx={{ fontSize: 16, color: 'text.secondary' }} />
            ) : (
              <DarkMode sx={{ fontSize: 16, color: 'text.secondary' }} />
            )}
            <Box sx={{ flex: 1 }}>
              {colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </Box>
          </Stack>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleClose} sx={{ color: 'text.secondary' }}>
          <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
            <Logout sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Box sx={{ flex: 1 }}>Sign out</Box>
          </Stack>
        </MenuItem>
      </Menu>
    </>
  );
}
