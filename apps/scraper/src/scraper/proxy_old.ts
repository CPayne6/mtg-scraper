const proxyRequirements = {
  protocol: 'https',
  anonymity: 'elite',
  country: 'CA,US',
  ssl: 'yes',
};

const params = new URLSearchParams(proxyRequirements);

const proxyUrl =
  'https://api.proxyscrape.com/v4/free-proxy-list/get?request=displayproxies&timeout=10000&' +
  params.toString();

const proxies: { ip: string; disabled?: boolean }[] = [];

const proxiesPromise: Promise<void> = new Promise(() => {});
const initProxies = async () => {
  const proxyRes = await fetch(proxyUrl);
  const proxiesList = await proxyRes.text();
  for (const proxyIp of proxiesList.split('\r\n')) {
    if (proxyIp !== '') {
      proxies.push({ ip: proxyIp });
    }
  }
};

export const getProxyUrl = async (index?: number) => {
  await proxiesPromise;
  return proxies[
    index === undefined ? Math.floor(Math.random() * proxies.length) : index
  ];
};

initProxies();
