import { sql } from 'drizzle-orm';
import { db } from '../src/db';

export async function dropTable(tableName: string) {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS ${tableName} CASCADE;`));
  console.log(`Table ${tableName} dropped`);
}

export async function truncateTable(tableName: string) {
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE;`));
  console.log(`Table ${tableName} truncated`);
}

export async function resetMigrations() {
  await db.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations;`);
  console.log('Migration history reset');
}