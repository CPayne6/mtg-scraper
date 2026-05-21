import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SchedulerTriggerResponse {
  message?: string;
}

export interface SchedulerStatusResponse {
  status: string;
  initiatedAt?: number;
  finishedAt?: number;
  details?: Record<string, unknown>;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly configService: ConfigService) {}

  async triggerScheduler(limit?: number): Promise<SchedulerTriggerResponse> {
    const url = new URL('/manual/trigger', this.schedulerBase());
    if (limit !== undefined) {
      url.searchParams.set('limit', String(limit));
    }
    return this.send<SchedulerTriggerResponse>('PUT', url, 10_000);
  }

  async getSchedulerStatus(): Promise<SchedulerStatusResponse> {
    const url = new URL('/manual/status', this.schedulerBase());
    return this.send<SchedulerStatusResponse>('GET', url, 5_000);
  }

  private schedulerBase(): URL {
    const base = this.configService.get<string>('scheduler.internalUrl');
    if (!base) {
      throw new ServiceUnavailableException(
        'Scheduler proxy is not configured',
      );
    }
    return new URL(base.endsWith('/') ? base : `${base}/`);
  }

  private async send<T>(
    method: 'GET' | 'PUT',
    url: URL,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `Scheduler ${method} ${url.pathname} returned ${response.status}`,
        );
        throw new BadGatewayException(
          `Scheduler returned status ${response.status}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      this.logger.error(
        `Scheduler ${method} ${url.pathname} failed`,
        error as Error,
      );
      throw new ServiceUnavailableException('Scheduler is unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
