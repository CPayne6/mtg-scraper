import { WebscrapeProxy, OxylabsProxy } from './proxies';
import { Proxy } from './proxies/Proxy';

interface ProxyItem {
  proxy: Proxy;
  disabled?: boolean;
}

export const proxies: ProxyItem[] = [
  { proxy: new WebscrapeProxy() },
  { proxy: new OxylabsProxy() }
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
      })
    }
  }
}
