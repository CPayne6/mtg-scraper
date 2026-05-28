// URL-safe slug from a free-form display name. Lowercases, replaces non-alnum
// runs with `-`, trims dashes, caps at 60 chars. Falls back to "list" if the
// input is empty after normalization (e.g., name composed entirely of emoji).
export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'list';
}
