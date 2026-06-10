import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// Belt-and-suspenders CSRF defense. `X-Requested-With: XMLHttpRequest` is a
// non-simple CORS header, so any cross-origin attempt has to pass a preflight
// -- which our `enableCors({ origin: frontendUrl, credentials: true })`
// configuration only grants to the configured frontend. A malicious
// cross-origin form POST cannot set this header and therefore cannot trigger
// the endpoint even with the principal cookie attached.
@Injectable()
export class XRequestedWithGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('x-requested-with');
    if (header !== 'XMLHttpRequest') {
      throw new ForbiddenException('Missing or invalid X-Requested-With header');
    }
    return true;
  }
}
