import { UnauthorizedException } from '@nestjs/common';

export class EmailNotVerifiedError extends UnauthorizedException {
  readonly code = 'email-not-verified' as const;

  constructor() {
    super(
      'Google has not verified this email. Please verify the email on your Google account and try again.',
    );
  }
}

export class EmailNotAuthoritativeError extends UnauthorizedException {
  readonly code = 'email-not-authoritative' as const;

  constructor() {
    super('Google cannot confirm current ownership of this email address.');
  }
}
