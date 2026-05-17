import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const COOKIE_NAME = 'scoutlgs_uid';

export const OwnerCookie = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.cookies?.[COOKIE_NAME];
  },
);
