import { describe, expect, it } from 'vitest';
import { ApiStorefrontOnboardingExecutor } from './onboarding-explorer-registry.service';

describe('ApiStorefrontOnboardingExecutor', () => {
  const input = { url: 'https://merchant.example/path', aiDiscovery: true, timeoutMs: 1000 };

  it('selects the detected backend and returns its common proposal result', async () => {
    const skipped = { detects: async () => false, onboard: async () => ({ status: 'wrong' }) };
    const conduct = { detects: async () => true, onboard: async () => ({ status: 'proposal-ready', proposedStore: { platformType: 'conduct_commerce' } }) };
    const result = await new ApiStorefrontOnboardingExecutor([skipped, conduct]).onboard(input);
    expect(result).toMatchObject({ status: 'proposal-ready', proposedStore: { platformType: 'conduct_commerce' } });
  });

  it('rejects without a proposal when no verified backend is detected', async () => {
    const result = await new ApiStorefrontOnboardingExecutor([{ detects: async () => false, onboard: async () => ({}) }]).onboard(input);
    expect(result).toMatchObject({ status: 'rejected', proposedStore: null });
  });
});
