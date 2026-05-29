import { createTheme, type ThemeOptions } from '@mui/material/styles';
import {
  brand,
  surfaceLight,
  surfaceDark,
  radii,
  motion,
  shadowsLight,
  shadowsDark,
} from './tokens';

const FONT_STACK = '"Inter", "Roboto", "Helvetica", "Arial", sans-serif';

const sharedTypography: ThemeOptions['typography'] = {
  fontFamily: FONT_STACK,
  h1: { fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 },
  h2: { fontSize: '2rem',   fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 },
  h3: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.25 },
  h4: { fontSize: '1.5rem',  fontWeight: 600, lineHeight: 1.3 },
  h5: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.35 },
  h6: { fontSize: '1rem',    fontWeight: 600, lineHeight: 1.4 },
  body1: { fontSize: '1rem',     lineHeight: 1.5 },
  body2: { fontSize: '0.875rem', lineHeight: 1.5 },
  caption: { fontSize: '0.75rem' },
  button: {
    textTransform: 'none',
    fontWeight: 600,
    letterSpacing: 0,
  },
};

const sharedShape = { borderRadius: radii.sm };

const sharedBreakpoints = {
  values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
};

function buildTheme(mode: 'light' | 'dark') {
  const isLight = mode === 'light';
  const surf = isLight ? surfaceLight : surfaceDark;
  const shadow = isLight ? shadowsLight : shadowsDark;
  const primaryMain = isLight ? brand.forest : brand.forestBright;
  const honeyTint = isLight ? brand.honeyTintLight : brand.honeyTintDark;

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain, contrastText: '#fff' },
      secondary: { main: brand.honey, contrastText: '#3d2a14' },
      honey: { main: brand.honey, dark: brand.honeyDeep, light: honeyTint, contrastText: '#3d2a14' },
      success: { main: primaryMain, contrastText: '#fff' },
      error: { main: '#d32f2f' },
      warning: { main: '#ed6c02' },
      info: { main: '#0288d1' },
      background: { default: surf.default, paper: surf.paper },
      surfaceSunken: surf.sunken,
      text: { primary: surf.fgPrimary, secondary: surf.fgSecondary, disabled: surf.fgDisabled },
      divider: surf.divider,
    },
    typography: sharedTypography,
    shape: sharedShape,
    spacing: 8,
    breakpoints: sharedBreakpoints,
    transitions: {
      duration: { shortest: 120, shorter: 160, short: 200, standard: 200, complex: 320 },
      easing: { easeInOut: motion.easeStandard, easeOut: motion.easeStandard, easeIn: motion.easeStandard, sharp: motion.easeEmphasis },
    },
    shadows: [
      'none',
      shadow.e1, shadow.e2, shadow.e3,
      shadow.e3, shadow.e3, shadow.e6,
      shadow.e6, shadow.e6, shadow.e6,
      shadow.e6, shadow.e6, shadow.e6,
      shadow.e6, shadow.e6, shadow.e6,
      shadow.e6, shadow.e6, shadow.e6,
      shadow.e6, shadow.e6, shadow.e6,
      shadow.e6, shadow.e6, shadow.e6,
    ] as ThemeOptions['shadows'],
    components: {
      MuiCssBaseline: {
        styleOverrides: `
          a { color: inherit; text-decoration: none; }
          a:hover { text-decoration: underline; text-underline-offset: 3px; }
          html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
          :where(button, a, input, textarea, select, [tabindex]):focus-visible {
            outline: 2px solid ${primaryMain};
            outline-offset: 2px;
            border-radius: ${radii.sm}px;
          }
        `,
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radii.sm,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 22,
            paddingRight: 22,
            transition: `background-color ${motion.durBase} ${motion.easeStandard}, transform 80ms`,
            '&:active': { transform: 'scale(0.98)' },
          },
          sizeLarge: { paddingTop: 14, paddingBottom: 14, paddingLeft: 28, paddingRight: 28, fontSize: 16 },
          sizeSmall: { paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12 },
          containedPrimary: {
            backgroundColor: primaryMain,
            color: '#fff',
            boxShadow: shadow.e1,
            '&:hover': { backgroundColor: isLight ? brand.forestDeep : '#2da028' },
          },
          outlinedPrimary: {
            borderColor: primaryMain,
            borderWidth: 1.5,
            color: primaryMain,
            '&:hover': { borderWidth: 1.5, backgroundColor: isLight ? 'rgba(74,103,65,0.06)' : 'rgba(36,135,33,0.14)' },
          },
          textPrimary: {
            color: primaryMain,
            paddingLeft: 14, paddingRight: 14,
            '&:hover': { backgroundColor: isLight ? 'rgba(74,103,65,0.08)' : 'rgba(36,135,33,0.14)' },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: radii.xl },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: radii.xl, boxShadow: shadow.e2 },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radii.sm,
            backgroundColor: surf.default,
            '& fieldset': { borderColor: surf.divider },
            '&:hover fieldset': { borderColor: surf.divider },
            '&.Mui-focused fieldset': { borderColor: primaryMain, borderWidth: 2 },
          },
          input: ({ theme }) => ({
            padding: '15px 14px',
            [theme.breakpoints.up('sm')]: { padding: '12px 14px' },
          }),
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          outlined: ({ theme }) => ({
            transform: 'translate(14px, 15px) scale(1)',
            [theme.breakpoints.up('sm')]: { transform: 'translate(14px, 12px) scale(1)' },
            '&.MuiInputLabel-shrink': {
              transform: 'translate(14px, -9px) scale(0.75)',
            },
          }),
        },
      },
      MuiFilledInput: {
        styleOverrides: { root: { borderRadius: radii.sm, backgroundColor: surf.default } },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radii.sm, fontWeight: 500 },
          outlined: { borderColor: surf.divider },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'default' },
        styleOverrides: {
          root: { backgroundColor: surf.paper, borderBottom: `1px solid ${surf.divider}` },
        },
      },
      MuiToolbar: {
        styleOverrides: { root: { minHeight: 64 } },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { borderRadius: radii.sm, fontSize: '0.75rem' } },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: radii.lg } },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { borderTopLeftRadius: radii.lg, borderBottomLeftRadius: radii.lg },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { borderRadius: radii.md } },
      },
    },
  });
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

export const getTheme = (mode: 'light' | 'dark') =>
  mode === 'dark' ? darkTheme : lightTheme;
