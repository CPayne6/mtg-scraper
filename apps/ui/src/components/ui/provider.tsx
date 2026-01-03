"use client"

import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useTheme } from 'next-themes';
import { useMemo } from 'react';
import { getTheme } from '@/theme';
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"

function MuiThemeWrapper({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  const theme = useMemo(() => {
    return getTheme(resolvedTheme === 'dark' ? 'dark' : 'light');
  }, [resolvedTheme]);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

export function Provider(props: ColorModeProviderProps) {
  return (
    <ColorModeProvider {...props}>
      <MuiThemeWrapper>
        {props.children}
      </MuiThemeWrapper>
    </ColorModeProvider>
  )
}
