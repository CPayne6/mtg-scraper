import { createTheme, ThemeOptions } from '@mui/material/styles';

// Define light mode theme
const lightThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: '#4a6741', // Forest green accent
    },
    secondary: {
      main: '#34d399', // Lighter green
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700, // Bolder
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
  },
  spacing: 8, // Base spacing unit (8px)
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        a {
          color: inherit;
          text-decoration: none;
        }
        a:hover {
          text-decoration: none;
          color: inherit;
        }
      `,
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
};

// Define dark mode theme
const darkThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#248721', // Forest green (brighter for dark mode)
    },
    secondary: {
      main: '#6ee7b7', // Lighter green (brighter for dark mode)
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
  typography: lightThemeOptions.typography,
  spacing: lightThemeOptions.spacing,
  breakpoints: lightThemeOptions.breakpoints,
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        a {
          color: inherit;
          text-decoration: none;
        }
        a:hover {
          text-decoration: none;
          color: inherit;
        }
      `,
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
};

export const lightTheme = createTheme(lightThemeOptions);
export const darkTheme = createTheme(darkThemeOptions);

// Helper to get theme based on mode
export const getTheme = (mode: 'light' | 'dark') => {
  return mode === 'dark' ? darkTheme : lightTheme;
};
