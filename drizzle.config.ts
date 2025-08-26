import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load environment variables
config();

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schemas/**",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: {
      rejectUnauthorized: false
    }
  },
  verbose: true,
  strict: true,
  
});