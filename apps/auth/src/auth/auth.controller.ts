import {
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthSessionService } from './auth-session.service';
import { JwtService } from './jwt.service';

@Controller()
export class AuthController {
  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Get('session')
  getSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authSessionService.getSession(req, res);
  }

  @Post('anonymous-session')
  createAnonymousSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authSessionService.createAnonymousSession(req, res);
  }

  @Get('internal/.well-known/jwks.json')
  getJwks(@Req() req: Request) {
    const host = req.header('host')?.split(':')[0].toLowerCase();
    const allowedHosts =
      this.configService.get<string[]>('jwt.internalAllowedHosts') ?? [];

    if (!host || !allowedHosts.includes(host)) {
      throw new NotFoundException();
    }

    return this.jwtService.getJwks();
  }
}
