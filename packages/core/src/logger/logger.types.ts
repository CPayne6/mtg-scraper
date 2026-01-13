export type NestLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

export function parseLogLevel(envValue?: string): NestLogLevel[] {
  const defaultLevels: NestLogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];

  if (!envValue) {
    return defaultLevels;
  }

  return envValue.split(',').map(level => level.trim()) as NestLogLevel[];
}
