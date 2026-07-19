import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { CardCart } from '@scoutlgs/core';
import { DataSource, In, LessThan, Repository } from 'typeorm';

const AUTH_QUERY_BATCH_SIZE = 500;

@Injectable()
export class CartCleanupService {
  private readonly logger = new Logger(CartCleanupService.name);

  constructor(
    @InjectRepository(CardCart)
    private readonly cartRepository: Repository<CardCart>,
    @InjectDataSource('auth')
    private readonly authDataSource: DataSource,
  ) {}

  async deleteExpiredAnonymousCarts(
    retentionDays: number,
    now = new Date(),
  ): Promise<number> {
    const threshold = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const candidates = await this.cartRepository.find({
      select: {
        id: true,
        ownerPrincipalUuid: true,
      },
      where: {
        updatedAt: LessThan(threshold),
      },
    });

    if (candidates.length === 0) {
      return 0;
    }

    const registeredPrincipals = await this.findRegisteredPrincipalUuids(
      candidates.map((cart) => cart.ownerPrincipalUuid),
    );
    const deleteIds = candidates
      .filter((cart) => !registeredPrincipals.has(cart.ownerPrincipalUuid))
      .map((cart) => cart.id);

    if (deleteIds.length === 0) {
      return 0;
    }

    const result = await this.cartRepository.delete({ id: In(deleteIds) });
    const deleted = result.affected ?? 0;

    if (deleted > 0) {
      this.logger.log(
        `Deleted ${deleted} inactive anonymous cart(s) updated before ${threshold.toISOString()}`,
      );
    }

    return deleted;
  }

  private async findRegisteredPrincipalUuids(
    principalUuids: string[],
  ): Promise<Set<string>> {
    const uniquePrincipalUuids = Array.from(new Set(principalUuids));
    const registered = new Set<string>();

    for (let i = 0; i < uniquePrincipalUuids.length; i += AUTH_QUERY_BATCH_SIZE) {
      const batch = uniquePrincipalUuids.slice(i, i + AUTH_QUERY_BATCH_SIZE);
      const rows = (await this.authDataSource.query(
        `
        WITH candidate_principals AS (
          SELECT id, uuid
          FROM principals
          WHERE uuid = ANY($1::uuid[])
        )
        SELECT p.uuid::text AS uuid
        FROM candidate_principals p
        INNER JOIN users u ON u.principal_id = p.id
        `,
        [batch],
      )) as Array<{ uuid: string }>;

      for (const row of rows) {
        registered.add(row.uuid);
      }
    }

    return registered;
  }
}
