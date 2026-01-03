import { WebshareProxy, OxylabsProxy } from './proxies';
import { Proxy } from './proxies/Proxy';

interface ProxyItem {
  proxy: Proxy;
  disabled?: boolean;
}

// NOTE: This is deprecated and will be removed. Use ProxyService instead.
// Kept temporarily for backward compatibility with HTTPLoader
function initializeProxies(): ProxyItem[] {
  const webshareHost = process.env.WEBSHARE_HOST ?? 'p.webshare.io';
  const websharePort = process.env.WEBSHARE_PORT ?? '80';
  const webshareUsername = process.env.WEBSHARE_USERNAME;
  const websharePassword = process.env.WEBSHARE_PASSWORD;

  const oxylabsHost = process.env.OXYLABS_HOST ?? 'dc.oxylabs.io';
  const oxylabsPort = process.env.OXYLABS_PORT ?? '8000';
  const oxylabsUsername = process.env.OXYLABS_USERNAME;
  const oxylabsPassword = process.env.OXYLABS_PASSWORD;

  const proxies: ProxyItem[] = [];

  if (webshareUsername && websharePassword) {
    proxies.push({
      proxy: new WebshareProxy(webshareHost, websharePort, webshareUsername, websharePassword)
    });
  }

  if (oxylabsUsername && oxylabsPassword) {
    proxies.push({
      proxy: new OxylabsProxy(oxylabsHost, oxylabsPort, oxylabsUsername, oxylabsPassword)
    });
  }

  return proxies;
}

export const proxies: ProxyItem[] = initializeProxies()

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
