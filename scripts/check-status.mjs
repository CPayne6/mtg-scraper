import pg from 'pg';

const client = new pg.Client({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'scoutlgs',
});

await client.connect();

const { rows } = await client.query(
  `SELECT extraction_status, COUNT(*) as count FROM product_urls GROUP BY extraction_status ORDER BY count DESC`
);
console.log('Product URL status breakdown:');
console.table(rows);

const { rows: [{ total }] } = await client.query('SELECT COUNT(*) as total FROM product_urls');
console.log('Total product URLs:', total);

await client.end();
