// Enqueue all pending (never-extracted) product URLs for extraction
// Run from scraper container: node /app/apps/scraper/enqueue-pending.js
// NOTE: No priority option - @nestjs/bull workers only consume from wait list, not prioritized set

const { Queue } = require('bullmq');
const { Client } = require('pg');

const BATCH_SIZE = 500;
const MAX_QUEUE_DEPTH = 5000;

async function run() {
  const redis = { host: process.env.REDIS_HOST || 'redis', port: parseInt(process.env.REDIS_PORT || '6379') };
  const q = new Queue('product-extraction', { connection: redis });

  const client = new Client({
    host: process.env.DATABASE_HOST || 'postgres',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scoutlgs',
  });

  await client.connect();

  const { rows: [{ c: total }] } = await client.query(
    "SELECT COUNT(*) as c FROM product_urls WHERE extraction_status = 'pending' AND last_extracted_at IS NULL"
  );
  console.log('Total to enqueue: ' + total);

  let enqueued = 0;
  let lastId = 0;

  while (true) {
    // Check queue depth before adding more
    const waiting = await q.getWaitingCount();
    const active = await q.getActiveCount();
    const delayed = await q.getDelayedCount();
    const depth = waiting + active + delayed;

    if (depth > MAX_QUEUE_DEPTH) {
      console.log('[' + new Date().toISOString() + '] Queue depth ' + depth + ' > ' + MAX_QUEUE_DEPTH + ', waiting...');
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }

    const { rows } = await client.query(
      "SELECT id, store_id, handle FROM product_urls WHERE extraction_status = 'pending' AND last_extracted_at IS NULL AND id > $1 ORDER BY id LIMIT $2",
      [lastId, BATCH_SIZE]
    );

    if (rows.length === 0) break;

    const jobs = rows.map(r => ({
      name: 'extract-product',
      data: { productUrlId: String(r.id), storeId: r.store_id, handle: r.handle },
      opts: { removeOnComplete: 100, removeOnFail: 500, attempts: 3 },
    }));

    await q.addBulk(jobs);
    lastId = Number(rows[rows.length - 1].id);
    enqueued += rows.length;

    const pct = ((enqueued / Number(total)) * 100).toFixed(1);
    console.log('[' + new Date().toISOString() + '] Enqueued: ' + enqueued + '/' + total + ' (' + pct + '%) lastId=' + lastId);

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Done! Total enqueued: ' + enqueued);
  await client.end();
  await q.close();
}

run().catch(e => { console.error(e); process.exit(1); });
