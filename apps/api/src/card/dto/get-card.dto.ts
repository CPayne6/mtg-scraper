import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class GetCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9\s,'-/&]+$/, {
    message: 'Card name contains invalid characters'
  })
  cardName: string;
}
