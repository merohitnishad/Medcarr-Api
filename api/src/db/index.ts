import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import { schema } from "./schema.js"; // ← the file you just made

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, "../../.env");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL! as string,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("Error acquiring client", err.stack);
  } else {
    console.log("Database connection successful");
    release(); // Release the client back to the pool
  }
});

export const db = drizzle(pool, { schema });
