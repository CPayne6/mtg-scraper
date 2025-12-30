import { HTTPLoader } from "../HTTPLoader";

// 1 day cache timeout
const defaultCacheTimeout = 86400000

export interface APILoaderConfig {
  initial: {
    baseUrl: string,
    path: string,
    params: string | string[][],
    searchKey: string
  },
  api: {
    baseUrl: string | RegExp,
    path: RegExp | (RegExp | string)[],
    params?: RegExp | [string, string | RegExp][],
    body?: RegExp | [string, any | RegExp][],
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  }
  cacheTimeout?: number
}

export const searchReplace = '{{search_term}}'

export class APILoader extends HTTPLoader {


  cachedPage: string
  cacheTimestamp: number

  constructor(protected apiConfig: APILoaderConfig) {
    super()
    this.cacheTimestamp = 0
    this.cachedPage = ''
  }

  cacheApiPage(page: string) {
    this.cachedPage = page
    this.cacheTimestamp = Date.now()
  }

  /**
   * Extract the regular expression from the desired string
   * 
   * if `wholeExpression` is set to true it will return the whole match
   * otherwise it will return the first captured group
   * default is false
   */
  runRegex(expression: RegExp, str: string, wholeExpression = false) {
    return expression.exec(str)?.[wholeExpression ? 0 : 1]
  }

  formatPath(path: APILoaderConfig['api']['path'], page: string, term: string) {
    let finalPath = path instanceof RegExp ? this.runRegex(path, page) ?? '' : ''
    if (Array.isArray(path)) {
      for (const pathParam of path) {
        finalPath += '/' + (
          pathParam instanceof RegExp
            ? this.runRegex(pathParam, page)
            : pathParam.includes(searchReplace)
              ? pathParam.replace(searchReplace, term)
              : pathParam
        )
      }
    }

    return finalPath
  }

  formatParams(params: APILoaderConfig['api']['params'], page: string, term: string) {
    const finalParams = new URLSearchParams(params instanceof RegExp ? this.runRegex(params, page) : undefined)

    if (Array.isArray(params)) {
      for (const param of params) {
        if (Array.isArray(param)) {
          const [key, value] = param
          const parsedValue = value instanceof RegExp ? this.runRegex(value, page) : value
          if (key && parsedValue) {
            finalParams.set(
              key,
              parsedValue.includes(searchReplace)
                ? parsedValue.replace(searchReplace, term)
                : parsedValue
            )
          }
        }
      }
    }
    return finalParams
  }

  formatBody(body: APILoaderConfig['api']['body'], page: string, term: string) {
    const finalBody = body instanceof RegExp ? JSON.parse(this.runRegex(body, page) ?? '{}') : {}

    if (Array.isArray(body)) {
      for (const item of body) {
        if (Array.isArray(item)) {
          const [key, value] = item
          const parsedValue = value instanceof RegExp ? this.runRegex(value, page) : value
          if (key && parsedValue) {
            finalBody[key] = typeof parsedValue === 'string' && parsedValue.includes(searchReplace)
              ? parsedValue.replace(searchReplace, term)
              : parsedValue
          }
        }
      }
    }
    return finalBody
  }

  async search(name: string, params: URLSearchParams = new URLSearchParams(this.apiConfig.initial.params)) {
    params.set(this.apiConfig.initial.searchKey, name);
    // Handle fetch if cache is out of date
    if (Date.now() - this.cacheTimestamp > (this.apiConfig.cacheTimeout ?? defaultCacheTimeout)) {
      const path = (this.apiConfig.initial.path.at(0) === '/' ? '' : '/') + this.apiConfig.initial.path
      const page = await super.loadPage(this.apiConfig.initial.baseUrl + path + "?" + params.toString());
      this.cacheApiPage(page)
    }

    const apiParams = this.formatParams(this.apiConfig.api.params, this.cachedPage, name)
    const apiPath = this.formatPath(this.apiConfig.api.path, this.cachedPage, name)
    const baseUrl = this.apiConfig.api.baseUrl instanceof RegExp ? this.runRegex(this.apiConfig.api.baseUrl, this.cachedPage) : this.apiConfig.api.baseUrl
    const body = this.formatBody(this.apiConfig.api.body, this.cachedPage, name)

    const api = baseUrl + apiPath + '?' + apiParams.toString()

    if (!baseUrl) {
      return {
        result: '{}',
        api,
        error: `Unable to parse base url from ${this.apiConfig.api.baseUrl}`
      }
    }


    console.log('fetching', api)

    try {
      return {
        result: await super.loadPage(api, ...(this.apiConfig.api.method ? [JSON.stringify(body), this.apiConfig.api.method] : [])),
        api
      }
    }
    catch (err) {
      return {
        result: '{}',
        api,
        error: `Error while fetching data`
      }
    }
  }

}
