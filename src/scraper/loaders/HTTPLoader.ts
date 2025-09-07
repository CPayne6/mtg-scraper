export abstract class HTTPLoader {

  constructor() {}

  async loadPage(url: string) {
    const res = await fetch(url);
    return await res.text();
  }

  abstract search(name: string, params?: URLSearchParams): Promise<{ result: string, api: string, error?: boolean | string }>
}
