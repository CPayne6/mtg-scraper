import { Controller, Get, Put, Query, ParseIntPipe } from '@nestjs/common'
import { ManualService } from './manual.service'

@Controller('manual')
export class ManualController {
  constructor(private readonly manualService: ManualService) {}

  // Popular cards scrape (V1)

  @Put('trigger')
  putManualTrigger(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.manualService.triggerScrape(limit)
  }

  @Get('status')
  getStatus() {
    return this.manualService.getStatus()
  }

  // Product discovery (V2)

  @Put('discovery/trigger')
  putDiscoveryTrigger() {
    return this.manualService.triggerDiscovery()
  }

  @Get('discovery/status')
  getDiscoveryStatus() {
    return this.manualService.getDiscoveryStatus()
  }
}