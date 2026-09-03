import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Store, validateStorefrontStoreConfig } from '@scoutlgs/core';
import { StorefrontOnboardingRun } from './storefront-onboarding-run.entity';

@Injectable()
export class StorefrontOnboardingApiService {
  constructor(
    @InjectRepository(StorefrontOnboardingRun)
    private readonly runs: Repository<StorefrontOnboardingRun>,
    @InjectRepository(Store)
    private readonly stores: Repository<Store>,
    private readonly dataSource: DataSource,
  ) {}

  async get(id: number) {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Onboarding run not found');
    return run;
  }

  /** Creates an auditable run. Execution is deliberately separate from approval. */
  async createRun(input: { url: string; proposedSlug?: string }) {
    let url: URL;
    try { url = new URL(input.url); } catch { throw new BadRequestException('url must be absolute HTTP(S)'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new BadRequestException('url must be an unauthenticated HTTP(S) URL');
    url.pathname = '/'; url.search = ''; url.hash = '';
    const run = this.runs.create({ requestedUrl: url.toString(), requestedSlug: input.proposedSlug, status: 'running' });
    return this.runs.save(run);
  }

  /** Approval consumes only the immutable server-side proposal. */
  async approve(id: number, digest: string, approverUuid: string) {
    return this.dataSource.transaction(async (manager) => {
      const run = await manager.getRepository(StorefrontOnboardingRun)
        .createQueryBuilder('run').setLock('pessimistic_write')
        .where('run.id = :id', { id }).getOne();
      if (!run) throw new NotFoundException('Onboarding run not found');
      if (run.status !== 'proposal-ready' || !run.proposal || !run.digest)
        throw new BadRequestException('Run is not approval-ready');
      if (run.digest !== digest)
        throw new BadRequestException('Proposal digest does not match');
      const canonical = JSON.stringify(run.proposal);
      if (createHash('sha256').update(canonical).digest('hex') !== run.digest)
        throw new BadRequestException('Stored proposal integrity check failed');
      const proposal = run.proposal as any;
      const validation = validateStorefrontStoreConfig(proposal);
      if (!validation.valid)
        throw new BadRequestException({ message: 'Stored proposal is invalid', errors: validation.errors });
      const existing = await manager.getRepository(Store).findOne({
        where: [{ name: proposal.name }, { baseUrl: proposal.baseUrl }],
      });
      if (existing) throw new BadRequestException('A store with this name or URL already exists');
      const store = await manager.getRepository(Store).save({
        ...proposal,
        isActive: false,
        discoveryConfig: { discoveryEnabled: false },
      });
      run.status = 'approved'; run.approvedStoreId = store.id;
      run.approvedByUserUuid = approverUuid; run.approvedAt = new Date();
      await manager.getRepository(StorefrontOnboardingRun).save(run);
      return store;
    });
  }
}
