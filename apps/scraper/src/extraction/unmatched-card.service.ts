import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface UnmatchedCardRow {
  storeId: number;
  productUrlId: string;
  rawName: string;
  normalizedName: string;
  setName: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  condition: string;
  foil: boolean;
  price: number;
  currency: string;
  inStock: boolean;
  quantity: number | null;
  imageUrl: string | null;
  productLink: string;
  sku: string | null;
  platformVariantId: string | null;
}

@Injectable()
export class UnmatchedCardService {
  private readonly logger = new Logger(UnmatchedCardService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Batch upsert unmatched cards using UNNEST.
   * ON CONFLICT (store_id, product_url_id, raw_name) → update price/stock fields,
   * preserve retry_count.
   */
  async upsertBatch(rows: UnmatchedCardRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const storeIds: number[] = [];
    const productUrlIds: string[] = [];
    const rawNames: string[] = [];
    const normalizedNames: string[] = [];
    const setNames: (string | null)[] = [];
    const setCodes: (string | null)[] = [];
    const collectorNumbers: (string | null)[] = [];
    const conditions: string[] = [];
    const foils: boolean[] = [];
    const prices: number[] = [];
    const currencies: string[] = [];
    const inStocks: boolean[] = [];
    const quantities: (number | null)[] = [];
    const imageUrls: (string | null)[] = [];
    const productLinks: string[] = [];
    const skus: (string | null)[] = [];
    const platformVariantIds: (string | null)[] = [];

    for (const row of rows) {
      storeIds.push(row.storeId);
      productUrlIds.push(row.productUrlId);
      rawNames.push(row.rawName);
      normalizedNames.push(row.normalizedName);
      setNames.push(row.setName);
      setCodes.push(row.setCode);
      collectorNumbers.push(row.collectorNumber);
      conditions.push(row.condition);
      foils.push(row.foil);
      prices.push(row.price);
      currencies.push(row.currency);
      inStocks.push(row.inStock);
      quantities.push(row.quantity);
      imageUrls.push(row.imageUrl);
      productLinks.push(row.productLink);
      skus.push(row.sku);
      platformVariantIds.push(row.platformVariantId);
    }

    const result = await this.dataSource.query(
      `
      INSERT INTO unmatched_cards (
        store_id, product_url_id, raw_name, normalized_name,
        set_name, set_code, collector_number,
        condition, foil, price, currency, in_stock, quantity,
        image_url, product_link, sku, platform_variant_id
      )
      SELECT
        unnest($1::int[]),
        unnest($2::bigint[]),
        unnest($3::varchar[]),
        unnest($4::varchar[]),
        unnest($5::varchar[]),
        unnest($6::varchar[]),
        unnest($7::varchar[]),
        unnest($8::varchar[]),
        unnest($9::boolean[]),
        unnest($10::numeric[]),
        unnest($11::varchar[]),
        unnest($12::boolean[]),
        unnest($13::int[]),
        unnest($14::text[]),
        unnest($15::text[]),
        unnest($16::varchar[]),
        unnest($17::varchar[])
      ON CONFLICT (store_id, product_url_id, raw_name) DO UPDATE SET
        normalized_name = EXCLUDED.normalized_name,
        set_name = EXCLUDED.set_name,
        set_code = EXCLUDED.set_code,
        collector_number = EXCLUDED.collector_number,
        condition = EXCLUDED.condition,
        foil = EXCLUDED.foil,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        in_stock = EXCLUDED.in_stock,
        quantity = EXCLUDED.quantity,
        image_url = EXCLUDED.image_url,
        product_link = EXCLUDED.product_link,
        sku = EXCLUDED.sku,
        platform_variant_id = EXCLUDED.platform_variant_id,
        updated_at = NOW()
      `,
      [
        storeIds,
        productUrlIds,
        rawNames,
        normalizedNames,
        setNames,
        setCodes,
        collectorNumbers,
        conditions,
        foils,
        prices,
        currencies,
        inStocks,
        quantities,
        imageUrls,
        productLinks,
        skus,
        platformVariantIds,
      ],
    );

    const affectedRows = result?.length ?? rows.length;
    this.logger.debug(`Batch upserted ${affectedRows} unmatched cards`);
    return affectedRows;
  }
}
