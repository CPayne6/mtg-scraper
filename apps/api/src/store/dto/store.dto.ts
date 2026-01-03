export class StoreResponseDto {
  id: number;
  uuid: string;
  name: string;
  displayName: string;
  logoUrl?: string;
  isActive: boolean;
}

export class StoreWithCountDto extends StoreResponseDto {
  cardCount: number;
}
