import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SchedulerJson = Record<string, unknown>;

interface StorefrontTriggerOptions {
  storeId?: number;
  splitRanges?: number;
  incremental?: boolean;
}

interface StorefrontTriggerAllOptions {
  splitRanges?: number;
  incremental?: boolean;
}

interface ExtractionTriggerOptions {
  skipExtraction?: boolean;
  incremental?: boolean;
}

interface ReextractUnmatchedOptions {
  storeId: number;
  limit?: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly configService: ConfigService) {}

  // ---- Storefront ----

  triggerStorefront(opts: StorefrontTriggerOptions): Promise<SchedulerJson> {
    const url = new URL('/manual/storefront/trigger', this.schedulerBase());
    this.setOptionalNumber(url, 'storeId', opts.storeId);
    this.setOptionalNumber(url, 'splitRanges', opts.splitRanges);
    this.setOptionalBoolean(url, 'incremental', opts.incremental);
    return this.send('PUT', url, 10_000);
  }

  triggerStorefrontAll(
    opts: StorefrontTriggerAllOptions,
  ): Promise<SchedulerJson> {
    const url = new URL(
      '/manual/storefront/trigger-all',
      this.schedulerBase(),
    );
    this.setOptionalNumber(url, 'splitRanges', opts.splitRanges);
    this.setOptionalBoolean(url, 'incremental', opts.incremental);
    return this.send('PUT', url, 10_000);
  }

  getStorefrontStatus(): Promise<SchedulerJson> {
    const url = new URL('/manual/storefront/status', this.schedulerBase());
    return this.send('GET', url, 5_000);
  }

  // ---- Extraction runs ----

  triggerExtraction(opts: ExtractionTriggerOptions): Promise<SchedulerJson> {
    const url = new URL('/manual/extraction/trigger', this.schedulerBase());
    this.setOptionalBoolean(url, 'skipExtraction', opts.skipExtraction);
    this.setOptionalBoolean(url, 'incremental', opts.incremental);
    return this.send('PUT', url, 10_000);
  }

  getExtractionStatus(): Promise<SchedulerJson> {
    const url = new URL('/manual/extraction/status', this.schedulerBase());
    return this.send('GET', url, 5_000);
  }

  listExtractionRuns(limit?: number): Promise<SchedulerJson> {
    const url = new URL('/manual/extraction', this.schedulerBase());
    this.setOptionalNumber(url, 'limit', limit);
    return this.send('GET', url, 5_000);
  }

  getExtractionRun(id: number): Promise<SchedulerJson> {
    const url = new URL(
      `/manual/extraction/${encodeURIComponent(String(id))}`,
      this.schedulerBase(),
    );
    return this.send('GET', url, 5_000);
  }

  // ---- Extraction maintenance ----

  reextractUnmatched(opts: ReextractUnmatchedOptions): Promise<SchedulerJson> {
    const url = new URL(
      '/manual/extraction/reextract-unmatched',
      this.schedulerBase(),
    );
    url.searchParams.set('storeId', String(opts.storeId));
    this.setOptionalNumber(url, 'limit', opts.limit);
    return this.send('PUT', url, 10_000);
  }

  getUnmatchedStats(): Promise<SchedulerJson> {
    const url = new URL(
      '/manual/extraction/unmatched-stats',
      this.schedulerBase(),
    );
    return this.send('GET', url, 5_000);
  }

  sweepFailed(olderThanMs?: number): Promise<SchedulerJson> {
    const url = new URL(
      '/manual/extraction/sweep-failed',
      this.schedulerBase(),
    );
    this.setOptionalNumber(url, 'olderThanMs', olderThanMs);
    return this.send('PUT', url, 10_000);
  }

  // ---- internals ----

  private schedulerBase(): URL {
    const base = this.configService.get<string>('scheduler.internalUrl');
    if (!base) {
      throw new ServiceUnavailableException(
        'Scheduler proxy is not configured',
      );
    }
    return new URL(base.endsWith('/') ? base : `${base}/`);
  }

  private setOptionalNumber(url: URL, key: string, value?: number) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  private setOptionalBoolean(url: URL, key: string, value?: boolean) {
    if (value !== undefined) {
      url.searchParams.set(key, value ? 'true' : 'false');
    }
  }

  private async send(
    method: 'GET' | 'PUT',
    url: URL,
    timeoutMs: number,
  ): Promise<SchedulerJson> {
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
      const text = await response.text();
      if (!text) {
        return {} as SchedulerJson;
      }
      try {
        return JSON.parse(text) as SchedulerJson;
      } catch {
        this.logger.warn(
          `Scheduler ${method} ${url.pathname} returned non-JSON body`,
        );
        return { raw: text } as SchedulerJson;
      }
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
