import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ListingRow {
  cardNameId: number | null;
  cardPrintingId: number | null;
  storeId: number;
  productUrlId: string;
  title: string;
  rawTitle: string;
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
export class ListingUpsertService {
  private readonly logger = new Logger(ListingUpsertService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Batch upsert listings using UNNEST for performance.
   * ON CONFLICT (store_id, platform_variant_id) → update price, stock, etc.
   */
  async upsertBatch(rows: ListingRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    // Build parallel arrays for UNNEST
    const cardNameIds: (number | null)[] = [];
    const cardPrintingIds: (number | null)[] = [];
    const storeIds: number[] = [];
    const productUrlIds: string[] = [];
    const titles: string[] = [];
    const rawTitles: string[] = [];
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
      cardNameIds.push(row.cardNameId);
      cardPrintingIds.push(row.cardPrintingId);
      storeIds.push(row.storeId);
      productUrlIds.push(row.productUrlId);
      titles.push(row.title);
      rawTitles.push(row.rawTitle);
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
      INSERT INTO card_listings (
        card_name_id, card_printing_id, store_id, product_url_id,
        title, raw_title, set_name, set_code, collector_number,
        condition, foil, price, currency, in_stock, quantity,
        image_url, product_link, sku, platform_variant_id, price_updated_at
      )
      SELECT
        unnest($1::int[]),
        unnest($2::int[]),
        unnest($3::int[]),
        unnest($4::bigint[]),
        unnest($5::varchar[]),
        unnest($6::varchar[]),
        unnest($7::varchar[]),
        unnest($8::varchar[]),
        unnest($9::varchar[]),
        unnest($10::varchar[]),
        unnest($11::boolean[]),
        unnest($12::numeric[]),
        unnest($13::varchar[]),
        unnest($14::boolean[]),
        unnest($15::int[]),
        unnest($16::text[]),
        unnest($17::text[]),
        unnest($18::varchar[]),
        unnest($19::varchar[]),
        NOW()
      ON CONFLICT (store_id, platform_variant_id) DO UPDATE SET
        card_name_id = EXCLUDED.card_name_id,
        card_printing_id = EXCLUDED.card_printing_id,
        title = EXCLUDED.title,
        raw_title = EXCLUDED.raw_title,
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
        price_updated_at = NOW(),
        updated_at = NOW()
      `,
      [
        cardNameIds,
        cardPrintingIds,
        storeIds,
        productUrlIds,
        titles,
        rawTitles,
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
    this.logger.debug(`Batch upserted ${affectedRows} listings`);
    return affectedRows;
  }
}
