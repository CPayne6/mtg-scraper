import { Injectable } from '@nestjs/common';
import { fetch } from 'undici';
import { randomUUID } from 'crypto';
import type { Store } from '../../../database/store.entity';
import { RateLimiterService } from '../../../rate-limiter/rate-limiter.service';
import { validateConductCommerceConfig } from '../../platform-config.validation';
import type { ConductCommerceConfig } from '@scoutlgs/shared';
import type { ConductApiEnvelope, ConductListingsResult, ConductProductDetails, ConductSettings } from './conduct-commerce.types';

const BASE_URL = 'https://api.conductcommerce.com/v1/';
const OPERATIONS = new Set(['getStoreSettings', 'getProductListings', 'getProductDetails', 'getSearchSuggestions']);
export class ConductCommerceApiError extends Error { constructor(message: string, readonly status?: number, readonly retryable = false) { super(message); } }

@Injectable()
export class ConductCommerceClient {
  constructor(private readonly rateLimiter: RateLimiterService) {}
  async settings(store: Store) { return this.call<ConductSettings>(store, 'getStoreSettings', {}); }
  async listings(store: Store, input: { productTypeID?: number; category?: string; search?: string }) { return this.call<ConductListingsResult>(store, 'getProductListings', input); }
  async details(store: Store, inventoryID: number) { return this.call<ConductProductDetails>(store, 'getProductDetails', { inventoryID, skipRelated: true }); }
  async call<T>(store: Store, operation: string, input: Record<string, unknown>): Promise<T> {
    if (!OPERATIONS.has(operation)) throw new ConductCommerceApiError(`Unsupported Conduct operation: ${operation}`);
    const validation = validateConductCommerceConfig(store.scraperConfig);
    if (!validation.valid) throw new ConductCommerceApiError(`Invalid Conduct configuration: ${validation.errors.join('; ')}`);
    const config = validation.config as ConductCommerceConfig;
    const permit = await this.rateLimiter.acquirePermit(store.name, 0, Math.min(store.rateLimitPerSecond || 1, 1));
    if (!permit.allowed) await new Promise((resolve) => setTimeout(resolve, permit.retryAfterMs));
    let response: Awaited<ReturnType<typeof fetch>>;
    try { response = await fetch(BASE_URL + operation, { method: 'POST', headers: { 'content-type': 'text/plain', accept: 'application/json' }, body: JSON.stringify({ host: config.storefrontHost, reqID: randomUUID(), ...input }), signal: AbortSignal.timeout(20_000) }); }
    catch (error) { throw new ConductCommerceApiError(`Conduct request failed: ${(error as Error).message}`, undefined, true); }
    if (!response.ok) throw new ConductCommerceApiError(`Conduct HTTP ${response.status} for ${operation}`, response.status, response.status === 429 || response.status >= 500);
    let envelope: ConductApiEnvelope<T>;
    try { envelope = await response.json() as ConductApiEnvelope<T>; } catch { throw new ConductCommerceApiError(`Conduct returned malformed JSON for ${operation}`); }
    if (!envelope || typeof envelope.success !== 'boolean') throw new ConductCommerceApiError(`Conduct returned malformed envelope for ${operation}`);
    if (!envelope.success) throw new ConductCommerceApiError(`Conduct ${operation} failed: ${envelope.errors?.map((error) => error.message).filter(Boolean).join('; ') || 'unknown error'}`);
    if (envelope.result === undefined) throw new ConductCommerceApiError(`Conduct ${operation} returned no result`);
    return envelope.result;
  }
}
