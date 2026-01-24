import { Proxy } from './Proxy';

export class OxylabsProxy extends Proxy {
  constructor(host: string, port: string, username: string, password: string) {
    super('Oxylabs', host, port, username, password);
  }
}
