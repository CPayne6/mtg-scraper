import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthService } from './health.service';

// Health checks are not part of the API contract; stay unversioned.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check();
  }
}
