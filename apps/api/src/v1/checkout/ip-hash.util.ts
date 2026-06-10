import { createHash } from 'crypto';
import type { Request } from 'express';

// Express resolves req.ip from trusted proxy headers only when main.ts has
// configured `trust proxy`. Do not read forwarding headers here directly;
// direct clients can spoof them.
export function extractClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// Stable, non-reversible identifier for an IP. Plain SHA-256 -- we don't need
// keyed-hash secrecy here; the column is short-lived audit data, and the only
// goal is "two requests from the same IP collide, raw IP doesn't get logged".
export function hashIp(req: Request): string {
  return createHash('sha256').update(extractClientIp(req)).digest('hex');
}

export function hashUserAgent(req: Request): string | null {
  const ua = req.header('user-agent');
  if (!ua) return null;
  return createHash('sha256').update(ua).digest('hex');
}
