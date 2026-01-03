
export class Proxy {
  constructor(
    public readonly name: string,
    public readonly host: string,
    public readonly port: string,
    public readonly username?: string,
    public readonly password?: string
  ) { }

  toString(): string {
    if (this.username && this.password) {
      return `${this.username}:${this.password}@${this.host}:${this.port}`
    }
    return `${this.host}:${this.port}`
  }
}
