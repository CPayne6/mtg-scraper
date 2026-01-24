import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Proxy } from './proxies/Proxy';
import { WebshareProxy } from './proxies/WebshareProxy';

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
    // Only initialize with Webshare proxy service because we pay for it
    this.proxies = [
      {
        proxy: new WebshareProxy(
          this.configService.get<string>('WEBSHARE_HOST', 'p.webshare.io'),
          this.configService.get<string>('WEBSHARE_PORT', '80'),
          this.configService.get<string>('WEBSHARE_USERNAME', ''),
          this.configService.get<string>('WEBSHARE_PASSWORD', ''),
        ),
      },
    ];

    this.logger.log(`Initialized ${this.proxies.length} proxies`);
  }

  /**
   * Get the next proxy in a round-robin fashion
   */
  getProxy(): Proxy {
    return this.proxies[this.proxyIndex].proxy;
  }
}
