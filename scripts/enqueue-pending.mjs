import { Queue } from 'bullmq';
import pg from 'pg';

const BATCH_SIZE = 5000;
const redis = { host: process.env.REDIS_HOST || 'redis', port: parseInt(process.env.REDIS_PORT || '6379') };
const q = new Queue('product-extraction', { connection: redis });

const client = new pg.Client({
  host: process.env.DATABASE_HOST || 'postgres',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'scoutlgs',
});

async function getQueueDepth() {
  const w = await q.getWaitingCount();
  const a = await q.getActiveCount();
  return w + a;
}

async function run() {
  await client.connect();

  const { rows: [{ c: total }] } = await client.query(
    "SELECT COUNT(*) as c FROM product_urls WHERE extraction_status = 'pending' AND last_extracted_at IS NULL"
  );
  console.log(`Total to enqueue: ${total}`);

  let offset = 0;
  let enqueued = 0;

  while (true) {
    // Wait for queue capacity
    let depth = await getQueueDepth();
    while (depth > BATCH_SIZE) {
      console.log(`Queue depth ${depth}, waiting for capacity...`);
      await new Promise(r => setTimeout(r, 10000));
      depth = await getQueueDepth();
    }

    const { rows } = await client.query(
      "SELECT id, store_id, handle FROM product_urls WHERE extraction_status = 'pending' AND last_extracted_at IS NULL ORDER BY id LIMIT $1 OFFSET $2",
      [BATCH_SIZE, offset]
    );

    if (rows.length === 0) break;

    const jobs = rows.map(r => ({
      name: 'extract-product',
      data: { productUrlId: r.id, storeId: r.store_id, handle: r.handle, priority: 1 },
      opts: { priority: 1, removeOnComplete: 100, removeOnFail: 500, attempts: 3 },
    }));

    await q.addBulk(jobs);
    enqueued += rows.length;
    offset += rows.length;

    console.log(`Enqueued batch: ${rows.length} (total: ${enqueued}/${total})`);

    // Small delay between batches
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`Done! Total enqueued: ${enqueued}`);
  await client.end();
  await q.close();
}

run().catch(e => { console.error(e); process.exit(1); });
