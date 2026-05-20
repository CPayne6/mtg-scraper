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
    @Query('incremental', new ParseBoolPipe({ optional: true })) incremental?: boolean,
  ) {
    return this.manualService.triggerStorefrontExtraction({ storeId, splitRanges, incremental })
  }

  @Put('storefront/trigger-all')
  putStorefrontTriggerAll(
    @Query('splitRanges', new ParseIntPipe({ optional: true })) splitRanges?: number,
    @Query('incremental', new ParseBoolPipe({ optional: true })) incremental?: boolean,
  ) {
    return this.manualService.triggerAllStorefrontExtractions({ splitRanges, incremental })
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

  // Batch extraction runs

  @Put('extraction/trigger')
  putExtractionRunTrigger(
    @Query('skipExtraction', new ParseBoolPipe({ optional: true })) skipExtraction?: boolean,
    @Query('incremental', new ParseBoolPipe({ optional: true })) incremental?: boolean,
  ) {
    return this.manualService.triggerExtractionRun({ skipExtraction, incremental })
  }

  @Get('extraction/status')
  getExtractionRunStatus() {
    return this.manualService.getExtractionRunStatus()
  }

  @Get('extraction')
  getExtractionRuns(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.manualService.getExtractionRuns(limit)
  }

  @Get('extraction/:id')
  getExtractionRun(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.manualService.getExtractionRun(id)
  }

  // Drain permanently-failed storefront bucket jobs back into the queue.
  // Same logic as the cron sweeper, but immediate. Pass ?olderThanMs=0 to
  // sweep everything (including jobs that just failed).
  @Put('extraction/sweep-failed')
  putSweepFailed(
    @Query('olderThanMs', new ParseIntPipe({ optional: true }))
    olderThanMs?: number,
  ) {
    return this.manualService.sweepFailedStorefrontJobs(olderThanMs)
  }
}
