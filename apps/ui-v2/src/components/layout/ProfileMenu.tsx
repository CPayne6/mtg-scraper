import { useState, type MouseEvent, type ReactNode } from 'react';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Drawer from '@mui/material/Drawer';
import ListItemButton from '@mui/material/ListItemButton';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import ListIcon from '@mui/icons-material/ListAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import DarkMode from '@mui/icons-material/DarkMode';
import LightMode from '@mui/icons-material/LightMode';
import Logout from '@mui/icons-material/Logout';
import Person from '@mui/icons-material/Person';
import Close from '@mui/icons-material/Close';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from '@tanstack/react-router';
import { useColorMode } from '@/components/ui/color-mode';
import { useLists } from '@/components/lists/ListsContext';
import { useAuth } from '@/components/auth/AuthContext';

function initialsFor(label: string): string {
  const cleaned = label.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return cleaned[0]!.toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

type Row = {
  key: string;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'subtle';
};

export function ProfileMenu() {
  const navigate = useNavigate();
  const { count } = useLists();
  const { colorMode, toggleColorMode } = useColorMode();
  const { session, logout } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const handleClose = () => setAnchor(null);

  const user = session?.authenticated ? session.user : null;
  const displayLabel = user ? user.displayName ?? user.email ?? 'Account' : 'Guest';
  const subLabel = user?.email ?? null;
  const userInitials = user ? initialsFor(displayLabel) : null;

  const go = (path: '/lists' | '/settings' | '/login' | '/signup') => {
    setAnchor(null);
    navigate({ to: path });
  };

  const handleSignOut = async () => {
    setAnchor(null);
    try {
      await logout();
    } catch {
      // logout endpoint clears cookies regardless of error; AuthContext will retry the anon bootstrap
    }
  };

  const rows: Row[] = [
    {
      key: 'lists',
      icon: <ListIcon sx={{ fontSize: 18, color: 'text.secondary' }} />,
      label: 'Saved lists',
      trailing: (
        <Box
          sx={(t) => ({
            px: 1,
            py: '1px',
            borderRadius: '999px',
            bgcolor: t.palette.honey.light,
            color: t.palette.honey.dark,
            fontSize: '0.7rem',
            fontWeight: 600,
          })}
        >
          {count}
        </Box>
      ),
      onClick: () => go('/lists'),
    },
    {
      key: 'settings',
      icon: <SettingsIcon sx={{ fontSize: 18, color: 'text.secondary' }} />,
      label: 'Settings',
      onClick: () => go('/settings'),
    },
    {
      key: 'theme',
      icon:
        colorMode === 'dark' ? (
          <LightMode sx={{ fontSize: 18, color: 'text.secondary' }} />
        ) : (
          <DarkMode sx={{ fontSize: 18, color: 'text.secondary' }} />
        ),
      label: colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      onClick: toggleColorMode,
    },
  ];

  if (user) {
    rows.push({
      key: 'signout',
      icon: <Logout sx={{ fontSize: 18, color: 'text.secondary' }} />,
      label: 'Sign out',
      onClick: handleSignOut,
      variant: 'subtle',
    });
  }

  const header = user ? (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Avatar sx={{ width: 44, height: 44, bgcolor: 'primary.main', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
        {userInitials}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }} noWrap>
          {displayLabel}
        </Typography>
        {subLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }} noWrap>
            {subLabel}
          </Typography>
        )}
      </Box>
    </Box>
  ) : (
    <Box>
      <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Guest</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
        Save lists and sync across devices.
      </Typography>
      <Stack
        direction={{ xs: 'row', sm: 'column' }}
        spacing={1}
        sx={{ mt: 1.5 }}
      >
        <Button variant="contained" onClick={() => go('/login')} fullWidth>
          Sign in
        </Button>
        <Button variant="outlined" onClick={() => go('/signup')} fullWidth>
          Create account
        </Button>
      </Stack>
    </Box>
  );

  const rowList = rows.map((row) => (
    <ListItemButton
      key={row.key}
      onClick={row.onClick}
      sx={{
        py: { xs: 1.5, sm: 1 },
        px: { xs: 2, sm: 1.5 },
        color: row.variant === 'subtle' ? 'text.secondary' : 'text.primary',
      }}
    >
      <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
        {row.icon}
        <Box sx={{ flex: 1, fontSize: { xs: '1rem', sm: '0.92rem' } }}>{row.label}</Box>
        {row.trailing}
      </Stack>
    </ListItemButton>
  ));

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
          {userInitials ?? <Person sx={{ fontSize: 22 }} />}
        </Avatar>
      </IconButton>
      {isMobile ? (
        <Drawer
          anchor="top"
          open={open}
          onClose={handleClose}
          slotProps={{ paper: { sx: { borderRadius: 0 } } }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1.5, pb: 1 }}>
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              Account
            </Typography>
            <IconButton aria-label="Close menu" onClick={handleClose} size="small">
              <Close sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
          <Box sx={{ px: 2, pb: 2 }}>{header}</Box>
          <Divider />
          {rowList}
        </Drawer>
      ) : (
        <Menu
          anchorEl={anchor}
          open={open}
          onClose={handleClose}
          slotProps={{ paper: { sx: { minWidth: 260, mt: 1 } } }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ px: 1.5, py: 1.25 }}>{header}</Box>
          <Divider />
          {rows.slice(0, 2).map((row) => (
            <MenuItem key={row.key} onClick={row.onClick}>
              <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
                {row.icon}
                <Box sx={{ flex: 1 }}>{row.label}</Box>
                {row.trailing}
              </Stack>
            </MenuItem>
          ))}
          <Divider />
          <MenuItem onClick={rows[2]!.onClick}>
            <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
              {rows[2]!.icon}
              <Box sx={{ flex: 1 }}>{rows[2]!.label}</Box>
            </Stack>
          </MenuItem>
          {user && <Divider />}
          {user && (
            <MenuItem onClick={handleSignOut} sx={{ color: 'text.secondary' }}>
              <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1.5 }}>
                <Logout sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Box sx={{ flex: 1 }}>Sign out</Box>
              </Stack>
            </MenuItem>
          )}
        </Menu>
      )}
    </>
  );
}
