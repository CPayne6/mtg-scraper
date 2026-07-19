import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CardCart, CardVariant } from '@scoutlgs/core';
import { Condition, type CardWithStore } from '@scoutlgs/shared';
import { In, Repository } from 'typeorm';
import type { PrincipalContext } from '../../auth/principal.types';

export type CartItemResponse = CardWithStore & {
  id: number;
  addedAt: number;
};

export interface CartResponse {
  id: string | null;
  variantIds: number[];
  items: CartItemResponse[];
  updatedAt: Date | null;
}

const MAX_CART_ITEMS = 150;

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CardCart)
    private readonly cartRepository: Repository<CardCart>,
    @InjectRepository(CardVariant)
    private readonly cardVariantRepository: Repository<CardVariant>,
  ) {}

  async getCart(principal: PrincipalContext): Promise<CartResponse> {
    const cart = await this.cartRepository.findOne({
      where: { ownerPrincipalUuid: principal.principalUuid },
    });

    if (!cart) {
      return this.emptyResponse();
    }

    return this.buildResponse(cart);
  }

  async replaceCart(
    principal: PrincipalContext,
    variantIds: number[],
  ): Promise<CartResponse> {
    const normalizedIds = this.normalizeVariantIds(variantIds);
    const variantsById = await this.findVariantsById(normalizedIds);
    const existingIds = normalizedIds.filter((id) => variantsById.has(id));

    const saved = await this.upsertCart(principal, existingIds);

    return this.buildResponse(saved, variantsById);
  }

  async clearCart(principal: PrincipalContext): Promise<CartResponse> {
    const saved = await this.upsertCart(principal, []);
    return this.buildResponse(saved, new Map());
  }

  private async upsertCart(
    principal: PrincipalContext,
    cardVariantIds: number[],
  ): Promise<CardCart> {
    await this.cartRepository.upsert(
      {
        ownerPrincipalUuid: principal.principalUuid,
        cardVariantIds,
      },
      {
        conflictPaths: ['ownerPrincipalUuid'],
      },
    );

    const cart = await this.cartRepository.findOne({
      where: { ownerPrincipalUuid: principal.principalUuid },
    });

    if (!cart) {
      throw new Error('Cart upsert completed without a persisted row');
    }

    return cart;
  }

  private emptyResponse(): CartResponse {
    return {
      id: null,
      variantIds: [],
      items: [],
      updatedAt: null,
    };
  }

  private normalizeVariantIds(variantIds: number[]): number[] {
    const seen = new Set<number>();
    const normalized: number[] = [];

    for (const rawId of variantIds) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
      if (normalized.length >= MAX_CART_ITEMS) break;
    }

    return normalized;
  }

  private async buildResponse(
    cart: CardCart,
    prefetchedVariants?: Map<number, CardVariant>,
  ): Promise<CartResponse> {
    const variantsById =
      prefetchedVariants ?? (await this.findVariantsById(cart.cardVariantIds));
    const addedAt = cart.updatedAt?.getTime() ?? Date.now();
    const items = cart.cardVariantIds
      .map((id) => variantsById.get(id))
      .filter((variant): variant is CardVariant => Boolean(variant))
      .map((variant) => this.mapVariantToCartItem(variant, addedAt));

    return {
      id: cart.uuid,
      variantIds: items.map((item) => item.id),
      items,
      updatedAt: cart.updatedAt ?? null,
    };
  }

  private async findVariantsById(
    variantIds: number[],
  ): Promise<Map<number, CardVariant>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const variants = await this.cardVariantRepository.find({
      where: { id: In(variantIds), inStock: true },
      relations: [
        'condition',
        'cardListing',
        'cardListing.cardName',
        'cardListing.store',
        'cardListing.productUrl',
        'cardListing.cardPrinting',
        'cardListing.cardPrinting.set',
      ],
    });

    return new Map(variants.map((variant) => [variant.id, variant]));
  }

  private mapVariantToCartItem(
    variant: CardVariant,
    addedAt: number,
  ): CartItemResponse {
    const listing = variant.cardListing;
    const printing = listing.cardPrinting;
    const cardName = listing.cardName?.name ?? listing.rawTitle ?? 'Unknown card';
    const setName = printing?.set?.name ?? '';
    const productLink = listing.productUrl
      ? `${listing.store.baseUrl}/products/${listing.productUrl.handle}`
      : listing.store.baseUrl;

    return {
      id: variant.id,
      price: Number(variant.price),
      condition: (variant.condition?.code ?? Condition.UNKNOWN) as Condition,
      foil: variant.foil,
      image: listing.imageUrl ?? printing?.imageUri ?? '',
      title: `${cardName}${setName ? ` [${setName}]` : ''}`,
      currency: listing.currency,
      link: productLink,
      set: setName,
      card_number: printing?.collectorNumber ?? '',
      scryfall_id: printing?.scryfallId,
      variant_id: variant.platformVariantId,
      store: listing.store.displayName,
      store_key: listing.store.name,
      addedAt,
    };
  }
}
