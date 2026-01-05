import { createTheme, ThemeOptions } from '@mui/material/styles';

// Define light mode theme
const lightThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: '#0d9488', // Ocean teal
    },
    secondary: {
      main: '#8b5cf6', // Purple
    },
    background: {
      default: '#f0fdfa', // Aqua tint
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
};

// Define dark mode theme
const darkThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#5eead4', // Light teal
    },
    secondary: {
      main: '#c4b5fd', // Light purple
    },
    background: {
      default: '#134e4a', // Deep ocean
      paper: '#1e40af', // Deep teal-blue
    },
  },
  typography: lightThemeOptions.typography,
  spacing: lightThemeOptions.spacing,
  breakpoints: lightThemeOptions.breakpoints,
};

export const lightTheme = createTheme(lightThemeOptions);
export const darkTheme = createTheme(darkThemeOptions);

// Helper to get theme based on mode
export const getTheme = (mode: 'light' | 'dark') => {
  return mode === 'dark' ? darkTheme : lightTheme;
};
