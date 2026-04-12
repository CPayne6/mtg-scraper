import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class ReplaceCardsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  cards: string[];
}
