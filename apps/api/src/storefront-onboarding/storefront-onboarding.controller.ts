import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { StorefrontOnboardingApiService } from './storefront-onboarding.service';
import { StorefrontOnboardingExecutionService } from './storefront-onboarding-execution.service';

@Controller('admin/storefront-onboarding')
@UseGuards(AdminGuard)
export class StorefrontOnboardingController {
  constructor(private readonly service: StorefrontOnboardingApiService, private readonly execution: StorefrontOnboardingExecutionService) {}
  @Get('runs/:id') get(@Param('id', ParseIntPipe) id: number) { return this.service.get(id); }
  @Post('runs/:id/approve') approve(@Param('id', ParseIntPipe) id: number, @Body('digest') digest: string, @Req() req: any) { return this.service.approve(id, digest, req.principal.userUuid); }
  @Post('runs') async create(@Body() body: { url?: string; proposedSlug?: string; scope?: string; parserProfile?: unknown }) {
    const run = await this.service.createRun({ url: body.url ?? '', proposedSlug: body.proposedSlug, scope: body.scope, parserProfile: body.parserProfile });
    return this.execution.executeApi(run.id);
  }
}
