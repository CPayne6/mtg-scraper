import {
  Controller,
  Get,
  ParseBoolPipe,
  ParseIntPipe,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin/scheduler')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Storefront

  @Post('storefront/trigger')
  triggerStorefront(
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
  ) {
    return this.adminService.triggerStorefront({ storeId });
  }

  @Post('storefront/trigger-all')
  triggerStorefrontAll() {
    return this.adminService.triggerStorefrontAll();
  }

  @Get('storefront/status')
  getStorefrontStatus() {
    return this.adminService.getStorefrontStatus();
  }

  // Extraction runs

  @Post('extraction/trigger')
  triggerExtraction(
    @Query('skipExtraction', new ParseBoolPipe({ optional: true }))
    skipExtraction?: boolean,
    @Query('incremental', new ParseBoolPipe({ optional: true }))
    incremental?: boolean,
  ) {
    return this.adminService.triggerExtraction({
      skipExtraction,
      incremental,
    });
  }

  @Get('extraction/status')
  getExtractionStatus() {
    return this.adminService.getExtractionStatus();
  }

  @Get('extraction')
  listExtractionRuns(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.adminService.listExtractionRuns(limit);
  }

  // Extraction maintenance — declared BEFORE `extraction/:id` so Express
  // does not match the static names below as the :id param.

  @Post('extraction/reextract-unmatched')
  reextractUnmatched(
    @Query('storeId', ParseIntPipe) storeId: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.adminService.reextractUnmatched({ storeId, limit });
  }

  @Get('extraction/unmatched-stats')
  getUnmatchedStats() {
    return this.adminService.getUnmatchedStats();
  }

  @Post('extraction/sweep-failed')
  sweepFailed(
    @Query('olderThanMs', new ParseIntPipe({ optional: true }))
    olderThanMs?: number,
  ) {
    return this.adminService.sweepFailed(olderThanMs);
  }

  @Get('extraction/:id')
  getExtractionRun(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getExtractionRun(id);
  }
}
