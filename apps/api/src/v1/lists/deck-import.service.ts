import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DeckSection = 'mainboard' | 'commander' | 'companion' | 'sideboard' | 'maybeboard';
export interface ImportedCard { name: string; quantity: number; setCode?: string }
export interface ImportedSection { id: DeckSection; label: string; cards: ImportedCard[]; selectedByDefault: boolean }
export interface DeckImportPreview { provider: string; sourceUrl: string; name: string; sections: ImportedSection[]; warnings: string[] }

type Provider = { name: string; match(url: URL): { id: string; canonicalUrl: string } | null; load(id: string, canonicalUrl: string): Promise<DeckImportPreview> };
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;

function cards(value: unknown): ImportedCard[] {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value as Record<string, unknown>) : [];
  return items.flatMap((item: any) => {
    const name = item?.card?.oracleCard?.name ?? item?.card?.name ?? item?.name ?? item?.cardName;
    const quantity = Number(item?.quantity ?? item?.qty ?? item?.count ?? 1);
    const setCode = item?.card?.edition?.editioncode ?? item?.setCode ?? item?.set;
    return typeof name === 'string' && name.trim() && Number.isFinite(quantity) && quantity > 0
      ? [{ name: name.trim(), quantity: Math.min(60, Math.floor(quantity)), ...(typeof setCode === 'string' ? { setCode: setCode.toLowerCase() } : {}) }]
      : [];
  });
}

@Injectable()
export class DeckImportService {
  private readonly attempts = new Map<string, number[]>();
  private readonly providers: Provider[];

  constructor(private readonly config: ConfigService) {
    this.providers = [this.archidekt(), this.deckstats(), this.mtgGoldfish(), this.moxfield()];
  }

  async preview(rawUrl: string, principalUuid: string): Promise<DeckImportPreview> {
    this.enforceRateLimit(principalUuid);
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new UnprocessableEntityException('Enter a valid HTTPS deck link.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new UnprocessableEntityException('Only HTTPS public deck links are supported.');
    const provider = this.providers.find((candidate) => candidate.match(url));
    if (!provider) throw new UnprocessableEntityException('That deck site is not supported yet. Paste the deck list instead.');
    const match = provider.match(url)!;
    const preview = await provider.load(match.id, match.canonicalUrl);
    if (!preview.sections.some((section) => section.cards.length)) throw new UnprocessableEntityException('This deck link has no importable cards. It may be private or unavailable.');
    return preview;
  }

  private enforceRateLimit(principal: string) {
    const now = Date.now(); const recent = (this.attempts.get(principal) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= 12) throw this.rateLimited('Too many imports. Wait a minute and try again.');
    recent.push(now); this.attempts.set(principal, recent);
  }

  private async fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    try { return JSON.parse(await this.fetchText(url, { Accept: 'application/json', ...headers })); }
    catch (error) {
      if (error instanceof SyntaxError) throw new UnprocessableEntityException('The deck site returned an invalid deck list.');
      throw error;
    }
  }

  private async fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers, signal: controller.signal, redirect: 'error' });
      if (response.status === 401 || response.status === 403) throw new UnprocessableEntityException('This deck is private or access is not available. Paste the list instead.');
      if (response.status === 404) throw new UnprocessableEntityException('This deck link is unavailable or has expired.');
      if (response.status === 429) throw this.rateLimited('The deck site is rate-limiting imports. Try again shortly.');
      if (!response.ok) throw new ServiceUnavailableException('The deck site could not be reached. Paste the list instead.');
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_BYTES) throw new UnprocessableEntityException('The deck response is too large to import.');
      const body = await response.text();
      if (body.length > MAX_BYTES) throw new UnprocessableEntityException('The deck response is too large to import.');
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new ServiceUnavailableException('The deck site took too long to respond. Paste the list instead.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private archidekt(): Provider {
    return { name: 'Archidekt', match: (url) => {
      if (url.hostname !== 'archidekt.com') return null;
      const id = /^\/decks\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
      return id ? { id, canonicalUrl: `https://archidekt.com/decks/${id}` } : null;
    }, load: async (id, sourceUrl) => {
      const data = await this.fetchJson(`https://archidekt.com/api/decks/${encodeURIComponent(id)}/`);
      const grouped = new Map<DeckSection, ImportedCard[]>();
      for (const category of data?.categories ?? []) {
        const label = String(category?.name ?? '').toLowerCase();
        const section: DeckSection = label.includes('sideboard') ? 'sideboard' : label.includes('maybeboard') ? 'maybeboard' : label.includes('commander') ? 'commander' : label.includes('companion') ? 'companion' : 'mainboard';
        grouped.set(section, [...(grouped.get(section) ?? []), ...cards(category?.cards)]);
      }
      return this.previewFromSections('Archidekt', sourceUrl, data?.name, grouped);
    }};
  }

  private deckstats(): Provider {
    return { name: 'Deckstats', match: (url) => {
      if (url.hostname !== 'deckstats.net' && url.hostname !== 'www.deckstats.net') return null;
      const id = /^\/decks\/\d+\/([^/?#]+)/.exec(url.pathname)?.[1];
      return id ? { id, canonicalUrl: `https://deckstats.net/decks/${url.pathname.split('/')[2]}/${id}` } : null;
    }, load: async (_id, sourceUrl) => {
      const text = await this.fetchText(`${sourceUrl}/?export_txt=1`, { Accept: 'text/plain' });
      return this.previewFromText('Deckstats', sourceUrl, text);
    }};
  }

  private mtgGoldfish(): Provider {
    return { name: 'MTGGoldfish', match: (url) => {
      if (url.hostname !== 'www.mtggoldfish.com' && url.hostname !== 'mtggoldfish.com') return null;
      const id = /^\/deck\/(\d+)/.exec(url.pathname)?.[1];
      return id ? { id, canonicalUrl: `https://www.mtggoldfish.com/deck/${id}` } : null;
    }, load: async (id, sourceUrl) => {
      const text = await this.fetchText(`https://www.mtggoldfish.com/deck/download/${encodeURIComponent(id)}`, { Accept: 'text/plain' });
      return this.previewFromText('MTGGoldfish', sourceUrl, text);
    }};
  }

  private moxfield(): Provider {
    return { name: 'Moxfield', match: (url) => {
      if (url.hostname !== 'moxfield.com' && url.hostname !== 'www.moxfield.com') return null;
      const id = /^\/decks\/([A-Za-z0-9_-]+)$/.exec(url.pathname)?.[1];
      return id ? { id, canonicalUrl: `https://www.moxfield.com/decks/${id}` } : null;
    }, load: async (id, sourceUrl) => {
      const endpoint = this.config.get<string>('deckImport.moxfieldEndpoint'); const credential = this.config.get<string>('deckImport.moxfieldCredential');
      if (!endpoint || !credential) throw new ServiceUnavailableException('Moxfield import is not configured. Paste the list instead.');
      const data = await this.fetchJson(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(id)}`, { Authorization: credential });
      const grouped = new Map<DeckSection, ImportedCard[]>();
      for (const [key, section] of [['mainboard', 'mainboard'], ['commanders', 'commander'], ['companions', 'companion'], ['sideboard', 'sideboard'], ['maybeboard', 'maybeboard']] as const) grouped.set(section, cards(data?.[key]));
      return this.previewFromSections('Moxfield', sourceUrl, data?.name, grouped);
    }};
  }

  private previewFromSections(provider: string, sourceUrl: string, rawName: unknown, sections: Map<DeckSection, ImportedCard[]>): DeckImportPreview {
    const labels: Record<DeckSection, string> = { mainboard: 'Mainboard', commander: 'Commanders', companion: 'Companion', sideboard: 'Sideboard', maybeboard: 'Maybeboard' };
    const ordered: DeckSection[] = ['mainboard', 'commander', 'companion', 'sideboard', 'maybeboard'];
    return { provider, sourceUrl, name: typeof rawName === 'string' && rawName.trim() ? rawName.trim().slice(0, 100) : 'Imported deck', warnings: [], sections: ordered.filter((id) => (sections.get(id)?.length ?? 0) > 0).map((id) => ({ id, label: labels[id], cards: sections.get(id)!, selectedByDefault: !['sideboard', 'maybeboard'].includes(id) })) };
  }

  private previewFromText(provider: string, sourceUrl: string, text: string): DeckImportPreview {
    const sections = new Map<DeckSection, ImportedCard[]>();
    let current: DeckSection = 'mainboard';
    let name = 'Imported deck';
    for (const line of text.split(/\r?\n/)) {
      const heading = line.trim().toLowerCase();
      if (heading.startsWith('//') || heading.startsWith('#')) { if (heading.includes('sideboard')) current = 'sideboard'; else if (heading.includes('maybeboard')) current = 'maybeboard'; else if (heading.includes('commander')) current = 'commander'; continue; }
      const match = /^\s*(\d+)\s*[xX]?\s+(.+?)(?:\s+\[([A-Za-z0-9]{2,10})\])?\s*$/.exec(line);
      if (!match) { if (!name || name === 'Imported deck') { const title = line.replace(/^\s*\/\//, '').trim(); if (title && !/^deck$/i.test(title)) name = title.slice(0, 100); } continue; }
      const quantity = Math.min(60, Number(match[1])); const cardName = match[2].trim();
      if (quantity > 0 && cardName) sections.set(current, [...(sections.get(current) ?? []), { name: cardName, quantity, ...(match[3] ? { setCode: match[3].toLowerCase() } : {}) }]);
    }
    return this.previewFromSections(provider, sourceUrl, name, sections);
  }

  private rateLimited(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
