import { Inject, Injectable } from '@nestjs/common';

export const ONBOARDING_EXPLORERS = Symbol('ONBOARDING_EXPLORERS');

export type UnifiedOnboardingInput = {
  url: string; proposedSlug?: string; scope?: string; currency?: string;
  parserProfile?: unknown; aiDiscovery: boolean; timeoutMs: number;
};

/** Backend boundary: detection is separate from exploration, and every
 * explorer returns the identical persisted onboarding report/proposal shape. */
export interface StoreOnboardingExplorer {
  detects(url: URL, timeoutMs: number): Promise<boolean>;
  onboard(input: UnifiedOnboardingInput): Promise<Record<string, any>>;
}

@Injectable()
export class ApiStorefrontOnboardingExecutor {
  constructor(@Inject(ONBOARDING_EXPLORERS) private readonly explorers: StoreOnboardingExplorer[]) {}

  async onboard(input: UnifiedOnboardingInput): Promise<Record<string, any>> {
    const url = new URL(input.url); url.pathname = '/'; url.search = ''; url.hash = '';
    for (const explorer of this.explorers) {
      if (await explorer.detects(url, input.timeoutMs)) return explorer.onboard({ ...input, url: url.toString() });
    }
    return {
      status: 'rejected', probeOnly: true, approvalRequired: true,
      input: { url: url.toString(), proposedSlug: input.proposedSlug },
      detection: { platform: null, endpointHost: url.hostname },
      scope: { warnings: ['No supported, verifiable catalog backend was detected'] },
      proposedStore: null,
    };
  }
}
