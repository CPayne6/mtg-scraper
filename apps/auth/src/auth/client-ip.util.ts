import type { Request } from 'express';

// Express resolves req.ip from trusted proxy headers only when main.ts has
// configured `trust proxy`. Do not read forwarding headers here directly;
// direct clients can spoof them.
export function extractClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}
