import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Min } from 'class-validator';

export class ReplaceCartDto {
  @IsArray()
  @ArrayMaxSize(150)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  variantIds: number[];
}
