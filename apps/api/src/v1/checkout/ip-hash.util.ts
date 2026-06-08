import { createHash } from 'crypto';
import type { Request } from 'express';

// Resolves the real client IP behind Cloudflare / reverse proxies.
// Matches apps/auth/src/auth/auth-session.service.ts:extractIp so the same
// principal produces the same ipHash across both services.
export function extractClientIp(req: Request): string {
  const cf = req.header('cf-connecting-ip');
  if (cf) return cf;

  const forwarded = req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

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
