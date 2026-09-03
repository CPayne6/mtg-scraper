import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { StorefrontOnboardingApiService } from './storefront-onboarding.service';

@Controller('admin/storefront-onboarding')
@UseGuards(AdminGuard)
export class StorefrontOnboardingController {
  constructor(private readonly service: StorefrontOnboardingApiService) {}
  private disabled(): never {
    throw new ServiceUnavailableException('Storefront onboarding endpoint is disabled');
  }
  @Get('runs/:id') get(@Param('id', ParseIntPipe) _id: number) { return this.disabled(); }
  @Post('runs/:id/approve') approve(@Param('id', ParseIntPipe) _id: number, @Body('digest') _digest: string, @Req() _req: any) { return this.disabled(); }
  @Post('runs') create(@Body() _body: { url?: string; proposedSlug?: string }) { return this.disabled(); }
}
