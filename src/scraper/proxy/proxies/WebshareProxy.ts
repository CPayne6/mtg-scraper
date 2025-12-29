import { config } from '../../../config'
import { Proxy } from './Proxy'

export class WebshareProxy extends Proxy {
  constructor() {
    super('Webshare', config.webshare.host, config.webshare.port, config.webshare.username, config.webshare.password)
  }
}
