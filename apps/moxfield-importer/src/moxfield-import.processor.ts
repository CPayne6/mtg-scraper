import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES, type MoxfieldDeckImportJobData, type MoxfieldDeckImportJobResult } from '@scoutlgs/shared';
import { MoxfieldBrowserService } from './moxfield-browser.service';

@Processor(QUEUE_NAMES.MOXFIELD_DECK_IMPORT)
export class MoxfieldImportProcessor {
  private readonly logger = new Logger(MoxfieldImportProcessor.name);

  constructor(private readonly browser: MoxfieldBrowserService) {}

  @Process({ name: JOB_NAMES.MOXFIELD_DECK_IMPORT, concurrency: 1 })
  async process(job: Job<MoxfieldDeckImportJobData>): Promise<MoxfieldDeckImportJobResult> {
    try {
      const deck = await this.browser.fetchDeck(job.data.deckId);
      this.logger.log(JSON.stringify({ event: 'moxfield_import_completed', jobId: job.id, queueWaitMs: Math.max(0, (job.processedOn ?? Date.now()) - job.data.enqueuedAt) }));
      return { provider: 'moxfield', deck };
    } catch (error) {
      this.logger.warn(JSON.stringify({ event: 'moxfield_import_failed', jobId: job.id, queueWaitMs: Math.max(0, (job.processedOn ?? Date.now()) - job.data.enqueuedAt), error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  }
}
