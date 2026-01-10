
function getEnvVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

interface IConfig {
  webshare: {
    username: string;
    password: string;
    port: string;
    host: string;
  },
  oxylabs: {
    username: string;
    password: string;
    port: string;
    host: string;
  }
}

export const config: IConfig = {
  webshare: {
    username: getEnvVariable('WEBSHARE_USERNAME'),
    password: getEnvVariable('WEBSHARE_PASSWORD'),
    port: process.env.WEBSHARE_PORT ?? '80',
    host: process.env.WEBSHARE_HOST ?? 'p.webshare.io',
  },
  oxylabs: {
    username: getEnvVariable('OXYLABS_USERNAME'),
    password: getEnvVariable('OXYLABS_PASSWORD'),
    port: process.env.OXYLABS_PORT ?? '8000',
    host: process.env.OXYLABS_HOST ?? 'dc.oxylabs.io',
  }
};