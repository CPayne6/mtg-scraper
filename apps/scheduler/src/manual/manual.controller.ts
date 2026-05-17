import { Controller, Get, Put, Param, Query, ParseIntPipe, ParseBoolPipe } from '@nestjs/common'
import { ManualService } from './manual.service'

@Controller('manual')
export class ManualController {
  constructor(private readonly manualService: ManualService) {}

  // Storefront extraction (V3)

  @Put('storefront/trigger')
  putStorefrontTrigger(
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
    @Query('splitRanges', new ParseIntPipe({ optional: true })) splitRanges?: number,
  ) {
    return this.manualService.triggerStorefrontExtraction({ storeId, splitRanges })
  }

  @Put('storefront/trigger-all')
  putStorefrontTriggerAll(
    @Query('splitRanges', new ParseIntPipe({ optional: true })) splitRanges?: number,
  ) {
    return this.manualService.triggerAllStorefrontExtractions({ splitRanges })
  }

  @Get('storefront/status')
  getStorefrontStatus() {
    return this.manualService.getStorefrontExtractionStatus()
  }

  // Generic extraction operations (platform-agnostic)

  @Put('extraction/reextract-unmatched')
  putReextractUnmatched(
    @Query('storeId', ParseIntPipe) storeId: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.manualService.reextractUnmatched({ storeId, limit })
  }

  @Get('extraction/unmatched-stats')
  getUnmatchedStats() {
    return this.manualService.getUnmatchedStats()
  }

  // Product discovery

  @Put('discovery/trigger')
  putDiscoveryTrigger(
    @Query('skipExtraction', new ParseBoolPipe({ optional: true })) skipExtraction?: boolean,
  ) {
    return this.manualService.triggerDiscovery({ skipExtraction })
  }

  @Get('discovery/status')
  getDiscoveryStatus() {
    return this.manualService.getDiscoveryStatus()
  }

  @Get('discovery/runs')
  getDiscoveryRuns(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.manualService.getDiscoveryRuns(limit)
  }

  @Get('discovery/runs/:id')
  getDiscoveryRun(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.manualService.getDiscoveryRun(id)
  }
}
