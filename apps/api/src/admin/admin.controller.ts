import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('scheduler/trigger')
  async triggerScheduler(@Query('limit') rawLimit?: string) {
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      const parsed = Number.parseInt(rawLimit, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new BadRequestException('limit must be a positive integer');
      }
      limit = parsed;
    }
    return this.adminService.triggerScheduler(limit);
  }

  @Get('scheduler/status')
  async getSchedulerStatus() {
    return this.adminService.getSchedulerStatus();
  }
}
