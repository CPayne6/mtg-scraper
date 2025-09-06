import { writeFileSync } from "fs";
import { HTTPLoader } from "../HTTPLoader";

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
    params?: RegExp | [string, string | RegExp][]
  }
}

export const searchReplace = '{{search_term}}'

export class APILoader extends HTTPLoader {

  constructor(protected apiConfig: APILoaderConfig) {
    super()
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

  async search(name: string, params: URLSearchParams = new URLSearchParams(this.apiConfig.initial.params)) {
    params.set(this.apiConfig.initial.searchKey, name);
    const path = (this.apiConfig.initial.path.at(0) === '/' ? '' : '/') + this.apiConfig.initial.path
    const page = await super.loadPage(this.apiConfig.initial.baseUrl + path + "?" + params.toString());

    const apiParams = this.formatParams(this.apiConfig.api.params, page, name)
    const apiPath = this.formatPath(this.apiConfig.api.path, page, name)
    const baseUrl = this.apiConfig.api.baseUrl instanceof RegExp ? this.runRegex(this.apiConfig.api.baseUrl, page) : this.apiConfig.api.baseUrl

    if(!baseUrl){
      return {
        result: '{}',
        api: baseUrl + apiPath + '?' + apiParams.toString(),
        error: `Unable to parse base url from ${this.apiConfig.api.baseUrl}`
      }
    }

    return {
      result: await super.loadPage(baseUrl + apiPath + '?' + apiParams.toString()),
      api: baseUrl + apiPath + '?' + apiParams.toString()
    }
  }

}
