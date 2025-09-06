import { HTTPLoader } from "./HTTPLoader";


export class SearchLoader extends HTTPLoader {

  constructor(protected baseUrl: string, protected path = '/search') {
    super()
  }

  search(name: string, params: URLSearchParams = new URLSearchParams): Promise<string> {
    params.set("q", name);
    return super.loadPage(this.baseUrl + this.path + "?" + params.toString());
  }
}
