import { describe, expect, it, vi } from 'vitest';
import { StorefrontOnboardingDryRunService } from './storefront-onboarding-dry-run.service';

const variant = {
  cardName: 'Lightning Bolt', setName: 'Magic 2010', setCode: 'm10',
  collectorNumber: '146', condition: 'nm', foil: false, price: 2,
  currency: 'CAD', inStock: true, productUrl: 'https://example.test/p/bolt',
  platformVariantId: '123', isToken: false,
};
const unmatched = {
  cardPrintingId: null, cardNameId: null, confidence: 'none',
  nameMatch: 'none', setMatch: 'none', printingMatch: 'none',
} as const;

describe('StorefrontOnboardingDryRunService', () => {
  it('creates a prospective card listing without any persistence dependency', async () => {
    const printingMatcher = { match: vi.fn().mockResolvedValue({
      cardPrintingId: 7, cardNameId: 5, confidence: 'exact',
      nameMatch: 'exact', setMatch: 'code_provided', printingMatch: 'set_and_number',
    }) };
    const tokenMatcher = { match: vi.fn() };
    const service = new StorefrontOnboardingDryRunService(printingMatcher as any, tokenMatcher as any);

    const [result] = await service.evaluate([variant]);

    expect(result.outcome).toBe('exact-printing');
    expect(result.prospectiveListing).toMatchObject({ cardPrintingId: 7, platformVariantId: '123' });
    expect(tokenMatcher.match).not.toHaveBeenCalled();
  });

  it('uses token matching only after an unresolved card match', async () => {
    const printingMatcher = { match: vi.fn().mockResolvedValue(unmatched) };
    const tokenMatcher = { match: vi.fn().mockResolvedValue({ tokenPrintingId: 9 }) };
    const service = new StorefrontOnboardingDryRunService(printingMatcher as any, tokenMatcher as any);

    expect((await service.evaluate([variant]))[0]).toMatchObject({ outcome: 'token', tokenPrintingId: 9 });
    expect(tokenMatcher.match).toHaveBeenCalledOnce();
  });

  it('does not send ambiguous card matches to the token matcher', async () => {
    const printingMatcher = { match: vi.fn().mockResolvedValue({
      ...unmatched, cardNameId: 5, nameMatch: 'exact', printingMatch: 'ambiguous',
    }) };
    const tokenMatcher = { match: vi.fn() };
    const service = new StorefrontOnboardingDryRunService(printingMatcher as any, tokenMatcher as any);

    expect((await service.evaluate([variant]))[0].outcome).toBe('ambiguous');
    expect(tokenMatcher.match).not.toHaveBeenCalled();
  });
});
