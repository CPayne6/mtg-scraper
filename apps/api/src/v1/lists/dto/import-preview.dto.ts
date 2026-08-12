import { IsString, IsUrl, MaxLength } from 'class-validator';

export class ImportPreviewDto {
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
}
