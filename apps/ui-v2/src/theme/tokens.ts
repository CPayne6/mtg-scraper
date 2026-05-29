// Design tokens — single source of truth for ScoutLGS v2.
// Mirrors colors_and_type.css from the design bundle; honey is the
// committed accent (overriding the older mint values that linger in
// REFINEMENTS.md and the upstream theme).

export const brand = {
  forest: '#4a6741',
  forestDeep: '#3d5535',
  forestBright: '#248721',
  honey: '#d99647',
  honeyDeep: '#a26418',
  honeyTintLight: 'rgba(217,150,71,0.18)',
  honeyTintDark: 'rgba(217,150,71,0.12)',
} as const;

export const surfaceLight = {
  default: '#f5f5f5',
  paper: '#ffffff',
  sunken: '#ebebeb',
  fgPrimary: 'rgba(0, 0, 0, 0.87)',
  fgSecondary: 'rgba(0, 0, 0, 0.60)',
  fgDisabled: 'rgba(0, 0, 0, 0.38)',
  divider: 'rgba(0, 0, 0, 0.12)',
} as const;

export const surfaceDark = {
  default: '#121212',
  paper: '#1e1e1e',
  sunken: '#0a0a0a',
  fgPrimary: 'rgba(255, 255, 255, 0.92)',
  fgSecondary: 'rgba(255, 255, 255, 0.65)',
  fgDisabled: 'rgba(255, 255, 255, 0.38)',
  divider: 'rgba(255, 255, 255, 0.12)',
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const motion = {
  durFast: '120ms',
  durBase: '200ms',
  durSlow: '320ms',
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeEmphasis: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const containers = {
  sm: 600,
  md: 900,
  lg: 1100,
} as const;

export const shadowsLight = {
  e1: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 1px rgba(15, 23, 42, 0.04)',
  e2: '0 3px 6px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
  e3: '0 8px 18px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)',
  e6: '0 18px 40px rgba(15, 23, 42, 0.12), 0 6px 12px rgba(15, 23, 42, 0.06)',
} as const;

export const shadowsDark = {
  e1: '0 1px 2px rgba(0, 0, 0, 0.6)',
  e2: '0 3px 6px rgba(0, 0, 0, 0.55)',
  e3: '0 8px 18px rgba(0, 0, 0, 0.55)',
  e6: '0 18px 40px rgba(0, 0, 0, 0.70), 0 6px 12px rgba(0, 0, 0, 0.5)',
} as const;

declare module '@mui/material/styles' {
  interface Palette {
    honey: Palette['primary'];
    surfaceSunken: string;
    primarySoft: string;
    primarySoftHover: string;
    primaryOutline: string;
    primarySolidHover: string;
    surfaceHover: string;
    surfaceSubtleHover: string;
    surfacePressed: string;
    honeyText: string;
    imageShadow: string;
    iconShadow: string;
    onImageOutline: string;
    gradientWashOpacity: number;
  }
  interface PaletteOptions {
    honey?: PaletteOptions['primary'];
    surfaceSunken?: string;
    primarySoft?: string;
    primarySoftHover?: string;
    primaryOutline?: string;
    primarySolidHover?: string;
    surfaceHover?: string;
    surfaceSubtleHover?: string;
    surfacePressed?: string;
    honeyText?: string;
    imageShadow?: string;
    iconShadow?: string;
    onImageOutline?: string;
    gradientWashOpacity?: number;
  }
}
