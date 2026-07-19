// Deterministic gradient palette used as a placeholder when no card image is
// available (or while one is still loading). Keyed off a stable id so the same
// card always picks the same gradient.

const ART_GRADIENTS = [
  'linear-gradient(135deg, #1a3a2a 0%, #4a6741 60%, #2a4a3a 100%)',
  'linear-gradient(135deg, #5a1a1a 0%, #8a3a2a 60%, #3a1010 100%)',
  'linear-gradient(135deg, #2a2a4a 0%, #4a5a8a 60%, #1a1a3a 100%)',
  'linear-gradient(135deg, #3a2a4a 0%, #6a4a8a 60%, #2a1a3a 100%)',
  'linear-gradient(135deg, #4a3a1a 0%, #8a6a2a 60%, #3a2a10 100%)',
  'linear-gradient(135deg, #1a4a4a 0%, #3a8a8a 60%, #1a3a3a 100%)',
  'linear-gradient(135deg, #4a1a3a 0%, #8a2a6a 60%, #3a1028 100%)',
];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function gradientForCard(key: string): string {
  return ART_GRADIENTS[hashIndex(key || '_', ART_GRADIENTS.length)];
}
