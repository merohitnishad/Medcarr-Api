import { sql } from "drizzle-orm";
import { db } from "../src/db"; // your db connection

async function resetDatabase() {
  try {
    // Drop all tables (be careful - this deletes everything!)
    await db.execute(sql`DROP SCHEMA public CASCADE;`);
    await db.execute(sql`CREATE SCHEMA public;`);

    console.log("Database reset successfully");
  } catch (error) {
    console.error("Error resetting database:", error);
  }
}

resetDatabase();
