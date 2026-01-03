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
    // Initialize proxies with configuration
    const webshareConfig = this.configService.get('proxy.webshare');
    const oxylabsConfig = this.configService.get('proxy.oxylabs');

    this.proxies = [
      {
        proxy: new WebshareProxy(
          webshareConfig.host,
          webshareConfig.port.toString(),
          webshareConfig.username,
          webshareConfig.password
        )
      },
      {
        proxy: new OxylabsProxy(
          oxylabsConfig.host,
          oxylabsConfig.port.toString(),
          oxylabsConfig.username,
          oxylabsConfig.password
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
