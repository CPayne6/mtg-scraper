import { sortColors } from '@/data/colors';

export function gradientForColors(colors: string): string {
  const sorted = sortColors(colors || '');
  switch (sorted) {
    case 'W':
      return 'linear-gradient(135deg, #f8f0c0, transparent 60%)';
    case 'U':
      return 'linear-gradient(135deg, #a3c4e8, transparent 60%)';
    case 'B':
      return 'linear-gradient(135deg, #888, transparent 60%)';
    case 'R':
      return 'linear-gradient(135deg, #e8a08a, transparent 60%)';
    case 'G':
      return 'linear-gradient(135deg, #a3c8a3, transparent 60%)';
    case 'WR':
      return 'linear-gradient(135deg, #f8f0c0, #e8a08a 70%, transparent)';
    case 'WG':
      return 'linear-gradient(135deg, #f8f0c0, #a3c8a3 70%, transparent)';
    case 'BG':
      return 'linear-gradient(135deg, #a3c8a3, #555 70%, transparent)';
    case 'UB':
      return 'linear-gradient(135deg, #a3c4e8, #555 70%, transparent)';
    case 'UR':
      return 'linear-gradient(135deg, #a3c4e8, #e8a08a 70%, transparent)';
    case 'WUBG':
      return 'linear-gradient(135deg, #f8f0c0, #a3c4e8, #555, #a3c8a3)';
    default:
      if (sorted.length >= 2) {
        // generic dual-or-more — chain known stops in order
        const stopMap: Record<string, string> = {
          W: '#f8f0c0',
          U: '#a3c4e8',
          B: '#555',
          R: '#e8a08a',
          G: '#a3c8a3',
        };
        const stops = sorted.split('').map((c) => stopMap[c]).filter(Boolean);
        return `linear-gradient(135deg, ${stops.join(', ')})`;
      }
      return 'linear-gradient(135deg, #ccc, transparent 60%)';
  }
}
