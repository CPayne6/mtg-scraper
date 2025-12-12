import * as undici from 'undici'
import { getProxy, disableProxy, Proxy } from '../proxy'

export abstract class HTTPLoader {
  protected proxy: Proxy | undefined

  constructor(protected readonly useProxy: boolean = true) {
    this.proxy = getProxy()
  }

  private createAgent(): undici.ProxyAgent | undefined {
    if (this.useProxy && this.proxy) {
      return new undici.ProxyAgent('http://' + this.proxy.toString())
    }
    return undefined
  }

  /**
   * Attempt to fetch with retries
   * 
   * Changes proxy on each retry if useProxy is enabled
   * 
   * @param input 
   * @param options 
   * @param retries 
   * @returns 
   */
  private async fetchWithRetry(input: undici.RequestInfo, options?: undici.RequestInit, retries = 1): Promise<undici.Response> {
    const fetchProxy = this.proxy;
    try {
      const res = await undici.fetch(input, {
        ...options,
        dispatcher: this.createAgent()
      });
      return res;
    } catch (error) {
      if (retries > 0) {
        console.warn(`Fetch failed for ${input}. Retrying... (${retries} retries left)`);
        if (this.useProxy) {
          disableProxy(fetchProxy!, 30000);
          this.proxy = getProxy();
        }
        return this.fetchWithRetry(input, options, retries - 1);
      } else {
        console.error(`Fetch failed for ${input}. No more retries left.`);
        throw error;
      }
    }
  }

  async loadPage(url: string, body?: string, method?: string) {
    const res = await this.fetchWithRetry(url, {
      method,
      body,
      headers: typeof body === 'string' ? new Headers({ "content-type": "application/json;" }) : undefined
    });
    return res.text();
  }

  abstract search(name: string, params?: URLSearchParams): Promise<{ result: string, api: string, error?: boolean | string }>
}
