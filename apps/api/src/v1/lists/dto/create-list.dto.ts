import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  cards: string[];

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
