import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

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
}
