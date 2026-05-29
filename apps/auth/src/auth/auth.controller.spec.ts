import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { JwtService } from './jwt.service';
import { UserAuthService } from './user-auth.service';

const makeRequest = (host: string) =>
  ({
    header: vi.fn((name: string) => (name === 'host' ? host : undefined)),
  }) as any;

describe('AuthController', () => {
  const setup = () => {
    const authSessionService = {
      getSession: vi.fn().mockResolvedValue({ authenticated: false }),
      createAnonymousSession: vi.fn().mockResolvedValue({
        authenticated: false,
        principal: { uuid: 'principal-uuid', kind: 'anonymous' },
      }),
    } as unknown as AuthSessionService;

    const jwtService = {
      getJwks: vi.fn().mockResolvedValue({ keys: [{ kid: 'primary-1' }] }),
    } as unknown as JwtService;

    const userAuthService = {
      signup: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as UserAuthService;

    const configService = {
      get: vi.fn((key: string) =>
        key === 'jwt.internalAllowedHosts' ? ['auth', 'localhost'] : undefined,
      ),
    } as unknown as ConfigService;

    return {
      authSessionService,
      jwtService,
      controller: new AuthController(
        authSessionService,
        userAuthService,
        jwtService,
        configService,
      ),
    };
  };

  it('keeps GET /session read-only by delegating to getSession only', async () => {
    const { authSessionService, controller } = setup();
    const req = {} as any;
    const res = {} as any;

    await controller.getSession(req, res);

    expect(authSessionService.getSession).toHaveBeenCalledWith(req, res);
    expect(authSessionService.createAnonymousSession).not.toHaveBeenCalled();
  });

  it('creates or reuses anonymous sessions through POST /anonymous-session', async () => {
    const { authSessionService, controller } = setup();
    const req = {} as any;
    const res = {} as any;

    await controller.createAnonymousSession(req, res);

    expect(authSessionService.createAnonymousSession).toHaveBeenCalledWith(
      req,
      res,
    );
  });

  it('serves JWKS to internal allowed hosts', async () => {
    const { controller, jwtService } = setup();

    const jwks = await controller.getJwks(makeRequest('auth:5002'));

    expect(jwtService.getJwks).toHaveBeenCalled();
    expect(jwks).toEqual({ keys: [{ kid: 'primary-1' }] });
  });

  it('hides JWKS from non-internal hosts', () => {
    const { controller, jwtService } = setup();

    expect(() => controller.getJwks(makeRequest('scoutlgs.ca'))).toThrow(
      NotFoundException,
    );
    expect(jwtService.getJwks).not.toHaveBeenCalled();
  });
});
