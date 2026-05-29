import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PrincipalContext } from './principal.types';

type PrincipalRequest = Request & { principal?: PrincipalContext };

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PrincipalContext | undefined => {
    const request = ctx.switchToHttp().getRequest<PrincipalRequest>();
    return request.principal;
  },
);
