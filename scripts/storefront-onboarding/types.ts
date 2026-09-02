export type StorefrontProduct = any;
export type AnchorFixture = {
  key: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  aliases: string[];
};
export type AnchorObservation = {
  fixture: AnchorFixture;
  query: string;
  products: StorefrontProduct[];
};
export type ScopeEvidence = {
  ok: boolean;
  query: string | null;
  strategy: string;
  source: "manual" | "inferred";
  evidence?: Record<string, unknown>;
  warnings: string[];
  productCount?: number;
  variantCount?: number;
};
export type ParserDryRun = {
  valid: boolean;
  sampledProducts: number;
  sampledVariants: number;
  validVariants: number;
  rejectedVariants: number;
  coverage: number;
  failuresByCode: Record<string, number>;
  rejections: Array<{
    productId?: string;
    variantId?: string;
    errors: string[];
  }>;
  errors: string[];
  warnings: string[];
};

export type StorefrontOnboardingRequest = {
  url: string;
  proposedSlug?: string;
  scope?: string;
  parserProfile?: unknown;
  aiDiscovery: boolean;
  apiVersion?: string;
  timeoutMs?: number;
};
export type StorefrontOnboardingDependencies = {
  storefront: {
    homepage(url: URL, timeoutMs: number): Promise<any>;
    products(
      url: URL,
      apiVersion: string,
      scope: string | null,
      timeoutMs: number,
      first?: number,
    ): Promise<{
      ok: boolean;
      endpoint: string;
      status: number | null;
      products: StorefrontProduct[];
      error?: string | null;
    }>;
    productsByTitle?(
      url: URL,
      apiVersion: string,
      title: string,
      timeoutMs: number,
      first?: number,
    ): Promise<{
      ok: boolean;
      endpoint: string;
      status: number | null;
      products: StorefrontProduct[];
      error?: string | null;
    }>;
  };
  parser: {
    validate(profile: unknown): {
      valid: boolean;
      errors: string[];
      warnings: string[];
    };
    dryRun(
      profile: unknown,
      products: StorefrontProduct[],
      scope: ScopeEvidence,
    ): ParserDryRun;
  };
  ai?: {
    discover(input: {
      evidence: unknown;
      correctiveErrors?: string[];
      timeoutMs: number;
    }): Promise<AiTransportResult>;
  };
  now?: () => Date;
  logger?: { warn(message: string, details?: unknown): void };
};
export type AiTransportResult =
  | {
      kind: "success";
      content: string;
      provider?: string;
      model?: string;
      latencyMs?: number;
    }
  | {
      kind: "transport-error";
      status?: number;
      retryAfterMs?: number;
      reason: string;
      transient?: boolean;
    };
