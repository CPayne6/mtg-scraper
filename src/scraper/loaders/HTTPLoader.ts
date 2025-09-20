
export abstract class HTTPLoader {

  constructor() {
  }

  async loadPage(url: string, body?: string, method?: string) {
    const res = await fetch(url, { method, body, headers: typeof body === 'string' ? new Headers({ "content-type": "application/json;" }) : undefined });
    return res.text();
  }

  abstract search(name: string, params?: URLSearchParams): Promise<{ result: string, api: string, error?: boolean | string }>
}
