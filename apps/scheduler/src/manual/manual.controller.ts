import { Controller, Get, Put, Query, ParseIntPipe } from '@nestjs/common'
import { ManualService } from './manual.service'

@Controller('manual')
export class ManualController {
  constructor(private readonly manualService: ManualService) {}

  @Put('trigger')
  putManualTrigger(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.manualService.triggerScrape(limit)
  }

  @Get('status')
  getStatus() {
    return this.manualService.getStatus()
  }
}