import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Proxy } from './proxies/Proxy';
import { WebshareProxy } from './proxies/WebshareProxy';
import { OxylabsProxy } from './proxies/OxylabsProxy';

interface ProxyItem {
  proxy: Proxy;
  disabled?: boolean;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly proxies: ProxyItem[];
  private proxyIndex = 0;

  constructor(private configService: ConfigService) {
    // Initialize proxies with configuration from environment variables
    this.proxies = [
      {
        proxy: new WebshareProxy(
          this.configService.get<string>('WEBSHARE_HOST', 'p.webshare.io'),
          this.configService.get<string>('WEBSHARE_PORT', '80'),
          this.configService.get<string>('WEBSHARE_USERNAME', ''),
          this.configService.get<string>('WEBSHARE_PASSWORD', '')
        )
      },
      {
        proxy: new OxylabsProxy(
          this.configService.get<string>('OXYLABS_HOST', 'dc.oxylabs.io'),
          this.configService.get<string>('OXYLABS_PORT', '8000'),
          this.configService.get<string>('OXYLABS_USERNAME', ''),
          this.configService.get<string>('OXYLABS_PASSWORD', '')
        )
      }
    ];

    this.logger.log(`Initialized ${this.proxies.length} proxies`);
  }

  /**
   * Get the next proxy in a round-robin fashion
   */
  getProxy(): Proxy {
    const initialIndex = this.proxyIndex;
    let proxyItem: ProxyItem;

    do {
      proxyItem = this.proxies[this.proxyIndex];
      this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    } while (proxyItem.disabled && this.proxyIndex !== initialIndex);

    return proxyItem.proxy;
  }

  /**
   * Disable a proxy from being used, e.g. if it fails
   *
   * @param proxyToDisable - Proxy to disable
   * @param enableTimeout - Timeout in ms to re-enable (default: 10000ms). Set to -1 to disable indefinitely
   */
  disableProxy(proxyToDisable: Proxy, enableTimeout: number = 10000): void {
    const proxyItem = this.proxies.find(item => item.proxy === proxyToDisable);

    if (proxyItem) {
      this.logger.warn(`Disabling proxy: ${proxyToDisable.name}`);
      proxyItem.disabled = true;

      if (enableTimeout >= 0) {
        setTimeout(() => {
          this.logger.log(`Re-enabling proxy: ${proxyToDisable.name}`);
          proxyItem.disabled = false;
        }, enableTimeout);
      }
    }
  }
}
