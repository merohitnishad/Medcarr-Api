import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, '../../.env');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
  } else {
    console.log('Database connection successful');
    release(); // Release the client back to the pool
  }
});

export const db = drizzle(pool);


