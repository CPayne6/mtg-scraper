export const ART_GRADIENTS = [
  'linear-gradient(135deg, #6b3f7e, #2d1f3d)',
  'linear-gradient(135deg, #c94838, #6f1d12)',
  'linear-gradient(135deg, #2f78c4, #14365e)',
  'linear-gradient(135deg, #d4a945, #6e5318)',
  'linear-gradient(135deg, #888, #444)',
  'linear-gradient(135deg, #4a8b3f, #1f3d1a)',
  'linear-gradient(135deg, #e8c46a, #6e5318)',
];

export function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}
