import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class DeliveryAddressDto {
  @IsString() @MaxLength(120) address1!: string;
  @IsOptional() @IsString() @MaxLength(120) address2?: string;
  @IsString() @MaxLength(80) city!: string;
  @IsString() @MaxLength(80) province!: string;
  @IsString() @MaxLength(20) postalCode!: string;
  @IsString() @MaxLength(2) countryCode!: string;
}

export class DeliveryOptionsDto {
  @ValidateNested() @Type(() => DeliveryAddressDto) address!: DeliveryAddressDto;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) stores!: string[];
}

export class DeliveryMethodSelectionDto {
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(200) handle?: string;
}

export class OptimizeDeliveryDto {
  @IsOptional() @IsString() quoteToken?: string;
  @IsOptional() @IsObject() @ValidateNested({ each: true })
  @Type(() => DeliveryMethodSelectionDto)
  selectedMethods?: Record<string, DeliveryMethodSelectionDto>;
}
