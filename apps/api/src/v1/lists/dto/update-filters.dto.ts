import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateFiltersDto {
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
}
