import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bullmq';
import { CardOptimizationService } from '@scoutlgs/core';
import { JOB_NAMES, QUEUE_NAMES, type CardOptimizationJobData } from '@scoutlgs/shared';

@Processor(QUEUE_NAMES.CARD_OPTIMIZATION)
export class OptimizationProcessor {
  private readonly logger = new Logger(OptimizationProcessor.name);
  constructor(private readonly optimization: CardOptimizationService) {}

  @Process({ name: JOB_NAMES.CARD_OPTIMIZATION, concurrency: 1 })
  async process(job: Job<CardOptimizationJobData>) {
    try {
      const result = await this.optimization.execute(job.data);
      const memory = process.memoryUsage();
      this.logger.log(JSON.stringify({
        event: 'card_optimization_completed', jobId: job.id,
        queueWaitMs: Math.max(0, (job.processedOn ?? Date.now()) - job.data.enqueuedAt),
        ...result.metrics, memoryRssBytes: memory.rss, memoryHeapUsedBytes: memory.heapUsed,
      }));
      return result;
    } catch (error) {
      const memory = process.memoryUsage();
      this.logger.error(JSON.stringify({ event: 'card_optimization_failed', jobId: job.id,
        queueWaitMs: Math.max(0, (job.processedOn ?? Date.now()) - job.data.enqueuedAt),
        memoryRssBytes: memory.rss, memoryHeapUsedBytes: memory.heapUsed,
        error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  }
}
