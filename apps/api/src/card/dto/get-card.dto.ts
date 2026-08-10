import { IsString, IsNotEmpty, MaxLength, IsUUID } from 'class-validator';

export class GetCardDto {
  @IsUUID()
  oracleId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cardName: string;
}
