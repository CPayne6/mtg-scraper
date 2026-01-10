import { Job, Queue } from 'bullmq';

export class MockJob<T = any> {
  constructor(
    public id: string,
    public name: string,
    public data: T,
    public opts: any = {},
  ) {}

  async updateProgress(progress: number): Promise<void> {
    return Promise.resolve();
  }

  async log(message: string): Promise<void> {
    return Promise.resolve();
  }

  async remove(): Promise<void> {
    return Promise.resolve();
  }
}

export class MockQueue<T = any> {
  private jobs: MockJob<T>[] = [];

  async add(name: string, data: T, opts?: any): Promise<Job<T>> {
    const job = new MockJob(
      `${Date.now()}-${Math.random()}`,
      name,
      data,
      opts,
    ) as unknown as Job<T>;
    this.jobs.push(job as unknown as MockJob<T>);
    return job;
  }

  async addBulk(jobs: Array<{ name: string; data: T; opts?: any }>): Promise<Job<T>[]> {
    return Promise.all(jobs.map(job => this.add(job.name, job.data, job.opts)));
  }

  async getJob(jobId: string): Promise<Job<T> | undefined> {
    return this.jobs.find(job => job.id === jobId) as unknown as Job<T>;
  }

  async getJobs(): Promise<Job<T>[]> {
    return this.jobs as unknown as Job<T>[];
  }

  async count(): Promise<number> {
    return this.jobs.length;
  }

  async clean(grace: number, limit: number, type?: string): Promise<string[]> {
    return [];
  }

  async obliterate(): Promise<void> {
    this.jobs = [];
  }

  async pause(): Promise<void> {
    return Promise.resolve();
  }

  async resume(): Promise<void> {
    return Promise.resolve();
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }

  clearJobs(): void {
    this.jobs = [];
  }
}

export const createMockQueue = <T = any>(): MockQueue<T> => new MockQueue<T>();

export const createMockJob = <T = any>(
  id: string,
  name: string,
  data: T,
  opts?: any,
): MockJob<T> => new MockJob(id, name, data, opts);
