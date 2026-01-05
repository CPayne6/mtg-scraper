import { Redis } from 'ioredis';

export class RedisMock {
  private store = new Map<string, string>();
  private subscribers = new Map<string, Set<(...args: any[]) => void>>();
  private pubsubListeners = new Map<string, ((...args: any[]) => void)[]>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    this.store.set(key, value);
    if (mode === 'EX' && duration) {
      setTimeout(() => this.store.delete(key), duration * 1000);
    }
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    setTimeout(() => this.store.delete(key), seconds * 1000);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    return this.store.has(key) ? 300 : -2;
  }

  async publish(channel: string, message: string): Promise<number> {
    const listeners = this.subscribers.get(channel);
    if (listeners) {
      listeners.forEach(listener => listener(channel, message));
    }
    return listeners?.size || 0;
  }

  subscribe(channel: string, callback?: (...args: any[]) => void): void {
    if (callback) {
      if (!this.subscribers.has(channel)) {
        this.subscribers.set(channel, new Set());
      }
      this.subscribers.get(channel)!.add(callback);
    }
  }

  on(event: string, listener: (...args: any[]) => void): this {
    if (!this.pubsubListeners.has(event)) {
      this.pubsubListeners.set(event, []);
    }
    this.pubsubListeners.get(event)!.push(listener);
    return this;
  }

  unsubscribe(channel?: string): void {
    if (channel) {
      this.subscribers.delete(channel);
    } else {
      this.subscribers.clear();
    }
  }

  disconnect(): void {
    this.store.clear();
    this.subscribers.clear();
    this.pubsubListeners.clear();
  }

  duplicate(): RedisMock {
    const dup = new RedisMock();
    dup.store = new Map(this.store);
    return dup;
  }

  config(operation: string, ...args: any[]): Promise<any> {
    return Promise.resolve('OK');
  }
}

export const createMockRedis = (): RedisMock => new RedisMock();
