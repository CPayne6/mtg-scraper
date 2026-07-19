import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { XRequestedWithGuard } from './csrf.guard';

function buildContext(headerValue: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name.toLowerCase() === 'x-requested-with' ? headerValue : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('XRequestedWithGuard', () => {
  const guard = new XRequestedWithGuard();

  it('allows requests with X-Requested-With: XMLHttpRequest', () => {
    expect(guard.canActivate(buildContext('XMLHttpRequest'))).toBe(true);
  });

  it('rejects requests missing the header', () => {
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects requests with a different value', () => {
    expect(() => guard.canActivate(buildContext('something-else'))).toThrow(
      ForbiddenException,
    );
  });
});
