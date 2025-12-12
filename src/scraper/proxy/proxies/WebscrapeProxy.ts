import { config } from '../../../config'
import { Proxy } from './Proxy'

export class WebscrapeProxy extends Proxy {
  constructor() {
    super('Webscrape', config.webshare.host, config.webshare.port, config.webshare.username, config.webshare.password)
  }
}
