/**
 * @nestjs/bull supplies legacy Bull jobs, where progress is a getter/setter
 * method. Some queue typings in this app expose BullMQ's numeric property.
 * Support both shapes so polling reads the value the worker persisted.
 */
export async function readRefreshJobProgress(job: unknown): Promise<number> {
  const candidate = job as {
    progress?: number | (() => number | Promise<number>);
  };
  if (typeof candidate.progress === 'function') {
    const value = await candidate.progress();
    return typeof value === 'number' ? value : 0;
  }
  return typeof candidate.progress === 'number' ? candidate.progress : 0;
}
