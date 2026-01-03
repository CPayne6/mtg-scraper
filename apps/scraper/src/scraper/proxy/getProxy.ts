import { WebshareProxy, OxylabsProxy } from './proxies';
import { Proxy } from './proxies/Proxy';

interface ProxyItem {
  proxy: Proxy;
  disabled?: boolean;
}

export const proxies: ProxyItem[] = [
  {
    proxy: new WebshareProxy(
      process.env.WEBSHARE_HOST || 'p.webshare.io',
      process.env.WEBSHARE_PORT || '80',
      process.env.WEBSHARE_USERNAME || '',
      process.env.WEBSHARE_PASSWORD || ''
    )
  },
  {
    proxy: new OxylabsProxy(
      process.env.OXYLABS_HOST || 'dc.oxylabs.io',
      process.env.OXYLABS_PORT || '8000',
      process.env.OXYLABS_USERNAME || '',
      process.env.OXYLABS_PASSWORD || ''
    )
  }
]

let proxyIndex = 0;

/**
 * Get the next proxy in a round-robin fashion
 * @returns 
 */
export const getProxy = () => {
  const initialIndex = proxyIndex;
  let proxyItem: ProxyItem;
  do {
    proxyItem = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;
  } while (proxyItem.disabled && proxyIndex !== initialIndex);
  return proxyItem.proxy;
}

/**
 * Disable a proxy from being used, e.g. if it fails
 * 
 * Set a timeout to re-enable, defaults to 10 seconds
 * Set to -1 to disable indefinitely
 * 
 * @param proxyToDisable Proxy
 * @param enableTimeout number
 */
export const disableProxy = (proxyToDisable: Proxy, enableTimeout: number = 10000) => {
  const proxyItem = proxies.find(item => item.proxy === proxyToDisable);
  if (proxyItem) {
    console.info(`Disabling proxy: ${proxyToDisable.name}`);
    proxyItem.disabled = true;
    if (enableTimeout >= 0) {
      setTimeout(() => {
        console.info(`Re-enabling proxy: ${proxyToDisable.name}`);
        proxyItem.disabled = false;
      }, enableTimeout)
    }
  }
}
