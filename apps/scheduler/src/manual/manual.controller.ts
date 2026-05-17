import { Controller, Get, Put, Param, Query, ParseIntPipe, ParseBoolPipe } from '@nestjs/common'
import { ManualService } from './manual.service'

@Controller('manual')
export class ManualController {
  constructor(private readonly manualService: ManualService) {}

  // Storefront extraction (V3)

  @Put('storefront/trigger')
  putStorefrontTrigger(
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
  ) {
    return this.manualService.triggerStorefrontExtraction({ storeId })
  }

  @Put('storefront/trigger-all')
  putStorefrontTriggerAll() {
    return this.manualService.triggerAllStorefrontExtractions()
  }

  @Get('storefront/status')
  getStorefrontStatus() {
    return this.manualService.getStorefrontExtractionStatus()
  }

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

  // Extraction error retry

  @Put('extraction/retry-errors')
  putRetryErrors(
    @Query('batchSize', new ParseIntPipe({ optional: true })) batchSize?: number,
  ) {
    return this.manualService.retryErroredUrls(batchSize)
  }

  @Get('extraction/retry-status')
  getRetryStatus() {
    return this.manualService.getRetryStatus()
  }

  // Re-extract unmatched cards

  @Put('extraction/reextract-unmatched')
  putReextractUnmatched(
    @Query('batchSize', new ParseIntPipe({ optional: true })) batchSize?: number,
  ) {
    return this.manualService.reextractUnmatched(batchSize)
  }

  @Get('extraction/reextract-status')
  getReextractStatus() {
    return this.manualService.getReextractStatus()
  }

  // Re-extract all product URLs from DB

  @Put('extraction/trigger')
  putTriggerExtraction(
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
  ) {
    return this.manualService.triggerExtraction({ storeId })
  }

  @Get('extraction/trigger-status')
  getTriggerExtractionStatus() {
    return this.manualService.getExtractionTriggerStatus()
  }
}