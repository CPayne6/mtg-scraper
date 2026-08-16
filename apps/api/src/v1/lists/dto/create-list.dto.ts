import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  MaxLength,
  IsIn,
  IsInt,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import type { CardListVisibility } from '@scoutlgs/core';

export class CreateListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ValidateIf((dto: CreateListDto) => !dto.cardNameIds?.length)
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  cards?: string[];

  @ValidateIf((dto: CreateListDto) => !dto.cards?.length)
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  cardNameIds?: number[];

  @IsOptional()
  @IsString()
  filterStores?: string;

  @IsOptional()
  @IsString()
  filterConditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  filterSetCode?: string;

  @IsOptional()
  @IsBoolean()
  ignoreBasicLands?: boolean;

  @IsOptional()
  @IsIn(['private', 'unlisted', 'public'])
  visibility?: CardListVisibility;
}
