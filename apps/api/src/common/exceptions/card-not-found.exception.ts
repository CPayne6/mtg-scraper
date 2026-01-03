import { NotFoundException } from '@nestjs/common';

export class CardNotFoundException extends NotFoundException {
  constructor(cardName: string) {
    super(`Card '${cardName}' not found`);
  }
}
