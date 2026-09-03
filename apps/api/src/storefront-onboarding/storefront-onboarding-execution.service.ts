import { Injectable, Logger } from '@nestjs/common';
import { StorefrontOnboardingApiService } from './storefront-onboarding.service';

export interface StorefrontOnboardingExecutor {
  onboard(input: {
    url: string;
    proposedSlug?: string;
    aiDiscovery: true;
    timeoutMs: number;
  }): Promise<Record<string, any>>;
}

/**
 * Production execution boundary. The HTTP controller remains disabled; this
 * service is invoked only by a future shared Storefront/Groq adapter or local
 * integration harness. It persists success and failure exactly once.
 */
@Injectable()
export class StorefrontOnboardingExecutionService {
  private readonly logger = new Logger(StorefrontOnboardingExecutionService.name);

  constructor(private readonly runs: StorefrontOnboardingApiService) {}

  async execute(id: number, executor: StorefrontOnboardingExecutor) {
    const run = await this.runs.get(id);
    if (run.status !== 'running') throw new Error('Run is not awaiting execution');
    try {
      const report = await executor.onboard({
        url: run.requestedUrl,
        proposedSlug: run.requestedSlug,
        aiDiscovery: true,
        timeoutMs: 30_000,
      });
      return this.runs.completeRun(id, report);
    } catch (error: any) {
      this.logger.error(`Storefront onboarding run ${id} failed`, error?.stack);
      return this.runs.completeRun(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'onboarding execution failed',
      });
    }
  }
}
