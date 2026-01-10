const { fetch, ProxyAgent } = require("undici")
const username = 'mtg_scraper'
const country = 'US'
const password = 'oF8_klmawfg3m390d20'
const agent = new ProxyAgent(`https://user-mtg_scraper_34zkt-country-US:oF8_klmawfg3m390d20@dc.oxylabs.io:8000`)
fetch('https://example.com/', {dispatcher: agent}).then(res => res.text()).then(console.log)

