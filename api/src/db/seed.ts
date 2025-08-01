import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import "dotenv/config";
import * as schema from "../db/schemas/utilsSchema.js";
import {
  careNeedsData,
  languagesData,
  specialitiesData,
  preferencesData
} from "../db/seeders/utils";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

type SeedData = { name: string }[];

const seedTable = async (
  tableName: string,
  table: any,
  data: SeedData
) => {
  try {
    console.log(`⌛ Seeding ${tableName}...`);
    
    // Use onConflictDoNothing with the name column (unique constraint)
    await db.insert(table).values(data).onConflictDoNothing({
      target: table.name
    });
    
    console.log(`✅ ${tableName} seeded successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error seeding ${tableName}:`, error);
    return false;
  }  
};

const main = async () => {
  console.log("🚀 Starting seeding process...");
  
  try {
    const results = await Promise.allSettled([
      seedTable("Languages", schema.languages, languagesData),
      seedTable("Specialities", schema.specialities, specialitiesData),
      seedTable("Care Needs", schema.careNeeds, careNeedsData),
      seedTable("Preferences", schema.preferences, preferencesData),
    ]);

    const hasErrors = results.some(result => 
      result.status === "rejected" || (result.status === "fulfilled" && !result.value)
    );

    if (hasErrors) {
      throw new Error("⚠️ Partial seeding failure - check logs above");
    }

    console.log("✨ All tables seeded successfully!");
  } catch (error) {
    console.error("🔥 Critical seeding error:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    console.log("🔌 Database connection closed");
  }
};

main();