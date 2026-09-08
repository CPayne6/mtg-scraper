import { describe, expect, it } from 'vitest';
import { ApiStorefrontOnboardingExecutor } from './onboarding-explorer-registry.service';

describe('ApiStorefrontOnboardingExecutor', () => {
  const input = { url: 'https://merchant.example/path', aiDiscovery: true, timeoutMs: 1000 };

  it('selects the detected backend and returns its common proposal result', async () => {
    const conduct = { detects: async () => true, onboard: async () => ({ status: 'proposal-ready', proposedStore: { platformType: 'conduct_commerce' } }) };
    const shopify = { detects: async () => false, onboard: async () => ({ status: 'wrong' }) };
    const result = await new ApiStorefrontOnboardingExecutor(conduct as any, shopify as any).onboard(input);
    expect(result).toMatchObject({ status: 'proposal-ready', proposedStore: { platformType: 'conduct_commerce' } });
  });

  it('rejects without a proposal when no verified backend is detected', async () => {
    const unavailable = { detects: async () => false, onboard: async () => ({}) };
    const result = await new ApiStorefrontOnboardingExecutor(unavailable as any, unavailable as any).onboard(input);
    expect(result).toMatchObject({ status: 'rejected', proposedStore: null });
  });
});
