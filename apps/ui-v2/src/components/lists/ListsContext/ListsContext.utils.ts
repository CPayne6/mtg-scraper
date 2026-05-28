import { readJson, writeJson } from '@/utils/storage';

// The server has no rename endpoint, so renames live in a client override map
// keyed by list id. A new device won't see the override.
export const NAME_OVERRIDES_KEY = 'scoutlgs:list-name-overrides';

export const readNameOverrides = (): Record<string, string> =>
  readJson<Record<string, string>>(NAME_OVERRIDES_KEY, {});

export const writeNameOverrides = (map: Record<string, string>): void =>
  writeJson(NAME_OVERRIDES_KEY, map);
