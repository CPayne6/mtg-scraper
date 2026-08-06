import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkSearchCardsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  @IsString({ each: true })
  names: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 50;
}
