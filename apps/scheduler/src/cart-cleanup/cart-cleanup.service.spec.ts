import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindOperator } from 'typeorm';
import { CartCleanupService } from './cart-cleanup.service';

describe('CartCleanupService', () => {
  let cartRepository: {
    find: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let authDataSource: { query: ReturnType<typeof vi.fn> };
  let service: CartCleanupService;

  beforeEach(() => {
    cartRepository = {
      find: vi.fn().mockResolvedValue([
        {
          id: 1,
          ownerPrincipalUuid: '11111111-1111-1111-1111-111111111111',
        },
        {
          id: 2,
          ownerPrincipalUuid: '22222222-2222-2222-2222-222222222222',
        },
      ]),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    authDataSource = {
      query: vi.fn().mockResolvedValue([
        { uuid: '22222222-2222-2222-2222-222222222222' },
      ]),
    };
    service = new CartCleanupService(cartRepository as any, authDataSource as any);
  });

  it('deletes old carts only when the principal is not associated with a user', async () => {
    const deleted = await service.deleteExpiredAnonymousCarts(
      30,
      new Date('2026-06-30T00:00:00.000Z'),
    );

    expect(deleted).toBe(1);
    expect(cartRepository.find).toHaveBeenCalledWith({
      select: { id: true, ownerPrincipalUuid: true },
      where: {
        createdAt: expect.any(FindOperator),
      },
    });
    expect(authDataSource.query).toHaveBeenCalledWith(expect.stringContaining('FROM users u'), [
      [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
    ]);
    expect(cartRepository.delete).toHaveBeenCalledWith({
      id: expect.any(FindOperator),
    });
  });

  it('keeps old carts when every principal is associated with a user', async () => {
    authDataSource.query.mockResolvedValue([
      { uuid: '11111111-1111-1111-1111-111111111111' },
      { uuid: '22222222-2222-2222-2222-222222222222' },
    ]);

    const deleted = await service.deleteExpiredAnonymousCarts(30);

    expect(deleted).toBe(0);
    expect(cartRepository.delete).not.toHaveBeenCalled();
  });

  it('does nothing when no carts are old enough', async () => {
    cartRepository.find.mockResolvedValue([]);

    const deleted = await service.deleteExpiredAnonymousCarts(30);

    expect(deleted).toBe(0);
    expect(authDataSource.query).not.toHaveBeenCalled();
    expect(cartRepository.delete).not.toHaveBeenCalled();
  });
});
