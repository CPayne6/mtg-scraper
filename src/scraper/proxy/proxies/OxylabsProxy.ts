import { Proxy } from './Proxy'
import { config } from '../../../config'

export class OxylabsProxy extends Proxy {
  constructor() {
    super('Oxylabs', config.oxylabs.host, config.oxylabs.port, config.oxylabs.username, config.oxylabs.password)
  }
}
