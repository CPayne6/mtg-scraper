import { Proxy } from './Proxy'

export class WebshareProxy extends Proxy {
  constructor(
    host: string,
    port: string,
    username: string,
    password: string
  ) {
    super('Webshare', host, port, username, password)
  }
}
