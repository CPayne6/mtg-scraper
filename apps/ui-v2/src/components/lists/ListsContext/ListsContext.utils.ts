export const LISTS_KEY = 'deck-lists';

export function normalizeName(name: string): string {
  return name.replace(/\W/g, '');
}
