import { BadRequestException } from '@nestjs/common';

export const MAX_SELECTED_STORES = 10;

/** Parse and enforce the shared public-store selection limit. */
export function parseSelectedStores(value?: string | null): string[] | undefined {
  if (!value) return undefined;
  const stores = [...new Set(value.split(',').map((store) => store.trim()).filter(Boolean))];
  if (stores.length > MAX_SELECTED_STORES) {
    throw new BadRequestException(`Select at most ${MAX_SELECTED_STORES} stores at a time`);
  }
  return stores;
}
