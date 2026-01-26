import * as undici from 'undici';
import { randomUUID } from 'crypto';
import { ProxyService } from '@/scraper/proxy/proxy.service';
import { HTTPLoader } from '../HTTPLoader';
import { ScrapeErrorType } from '../../errors';

const CONDUCT_COMMERCE_API_URL =
  'https://api.conductcommerce.com/v1/getProductListings';

/**
 * Product types available in the ConductCommerce API.
 * Each store may only support a subset of these types.
 */
export enum ConductCommerceProductType {
  MagicSingles = 1,
  PokemonSingles = 2,
  OnePieceCardGameSingles = 3,
  YuGiOhSingles = 4,
  ForceOfWillSingles = 5,
  TransformersSingles = 6,
  WeissSchwarzSingles = 7,
  DigimonSingles = 8,
  LorcanaSingles = 9,
  CardfightVanguardSingles = 10,
  DragonBallSuperCCGSingles = 11,
  FleshAndBloodSingles = 12,
  DragonBallSuperFusionWorldSingles = 13,
  PokemonJapanSingles = 14,
  RiftboundSingles = 15,
  SportsCards = 16,
}

export interface ConductCommerceLoaderConfig {
  /**
   * The store's host, e.g., "backtobackgames.conductcommerce.com"
   */
  host: string;
  /**
   * The product type to filter by. Defaults to MagicSingles (1).
   */
  productTypeID?: ConductCommerceProductType;
}

export class ConductCommerceLoader extends HTTPLoader {
  static create(
    config: ConductCommerceLoaderConfig,
    proxyService: ProxyService,
  ): ConductCommerceLoader {
    return new ConductCommerceLoader(config, proxyService.getProxyAgent());
  }

  constructor(
    protected config: ConductCommerceLoaderConfig,
    proxyAgent?: undici.ProxyAgent,
  ) {
    super(proxyAgent);
  }

  async search(
    name: string,
  ): Promise<{
    result: string;
    api: string;
    status?: number;
    error?: string;
    errorType?: ScrapeErrorType;
    retryable?: boolean;
  }> {
    const requestBody = {
      host: this.config.host,
      search: name,
      reqID: randomUUID(),
      productTypeID:
        this.config.productTypeID ?? ConductCommerceProductType.MagicSingles,
    };

    this.logger.debug(
      `Fetching ${CONDUCT_COMMERCE_API_URL} for "${name}" on ${this.config.host}`,
    );

    const result = await super.loadPageWithStatus(
      CONDUCT_COMMERCE_API_URL,
      JSON.stringify(requestBody),
      'POST',
    );

    if (result.error) {
      this.logger.warn(
        `API request failed [${result.error.getShortCode()}] ${CONDUCT_COMMERCE_API_URL}: ${result.error.message}`,
      );
      return {
        result: result.body || '{}',
        api: CONDUCT_COMMERCE_API_URL,
        status: result.status,
        error: result.error.message,
        errorType: result.error.type,
        retryable: result.error.isRetryable(),
      };
    }

    return {
      result: result.body,
      api: CONDUCT_COMMERCE_API_URL,
      status: result.status,
    };
  }
}