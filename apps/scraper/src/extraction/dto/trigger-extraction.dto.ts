import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class TriggerExtractionDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  storeId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  maxCardsAdded?: number;
}

export class RetryUnmatchedDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  storeId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  limit?: number = 1000;
}
