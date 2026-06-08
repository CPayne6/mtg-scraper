import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartLineDto {
  // Numeric Shopify variant id (e.g. "42039192191123"). Anchored regex --
  // anything non-numeric short-circuits before the URL builder sees it.
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'variantId must be a numeric string' })
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class StoreEntryDto {
  // Store slug matching stores.name in the DB (e.g. "401-games").
  // Whitelisted at the service layer against known stores.
  @IsString()
  @Matches(/^[a-z0-9-]{1,64}$/, {
    message: 'storeKey must be a kebab-case slug',
  })
  storeKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines!: CartLineDto[];
}

export class BuildCheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => StoreEntryDto)
  stores!: StoreEntryDto[];
}
