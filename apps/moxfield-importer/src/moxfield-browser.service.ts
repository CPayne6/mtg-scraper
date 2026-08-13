import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, type Browser } from 'playwright-core';

const DECK_ID = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_RESPONSE_BYTES = 1_000_000;
const TIMEOUT_MS = 20_000;

@Injectable()
export class MoxfieldBrowserService implements OnModuleInit, OnModuleDestroy {
  private browser?: Browser;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.browser = await chromium.launch({
      executablePath: this.config.get<string>('MOXFIELD_CHROMIUM_EXECUTABLE') || '/usr/bin/chromium',
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });
  }

  async onModuleDestroy() {
    await this.browser?.close();
  }

  async fetchDeck(deckId: string): Promise<unknown> {
    if (!DECK_ID.test(deckId)) throw new ServiceUnavailableException('Invalid Moxfield deck identifier.');
    if (!this.browser?.isConnected()) throw new ServiceUnavailableException('Moxfield browser is unavailable.');

    // A context is deliberately short-lived. It releases all page state as
    // soon as the import completes while the one Chromium process stays warm.
    const context = await this.browser.newContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(
        `https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(deckId)}`,
        { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS },
      );
      if (!response || !response.ok() || !response.headers()['content-type']?.includes('application/json')) {
        throw new ServiceUnavailableException('Moxfield deck import is unavailable. Paste the deck list instead.');
      }
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) throw new ServiceUnavailableException('Moxfield returned a deck response that is too large to import.');
      try { return JSON.parse(body); }
      catch { throw new ServiceUnavailableException('Moxfield returned an invalid deck response.'); }
    } finally {
      await context.close();
    }
  }
}
