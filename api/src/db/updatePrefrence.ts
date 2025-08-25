import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import "dotenv/config";
import * as schema from "../db/schemas/utilsSchema.js";
import { eq } from "drizzle-orm/expressions.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });


const updatedPreferencesData = [
  { name: "Non-Smoking" },
  { name: "Verified Background Check" },
  { name: "CPR & First Aid Certified" },
  { name: "Licensed Driver Available" },
  { name: "Fully Vaccinated" },
  { name: "Pet Friendly" },
  { name: "Nutritious Meal Preparation" },
  { name: "Household Maintenance Support" },
  { name: "End-of-Life Care Specialist" },
  { name: "Memory Care Professional" },
];
const updatePreferences = async () => {
  try {
    console.log("🔄 Starting preferences update process...");
    
    // First, get all existing preferences ordered by ID
    const existingPreferences = await db
      .select({ id: schema.preferences.id, name: schema.preferences.name })
      .from(schema.preferences)
      .orderBy(schema.preferences.id);
    
    console.log(`📋 Found ${existingPreferences.length} existing preferences`);
    console.log("Current preferences:", existingPreferences);
    
    // Check for potential conflicts
    const existingNames = new Set(existingPreferences.map(p => p.name));
    const newNames = updatedPreferencesData.map(p => p.name);
    const conflicts = newNames.filter(name => existingNames.has(name));
    
    if (conflicts.length > 0) {
      console.log("⚠️ Found potential naming conflicts:", conflicts);
    }
    
    // Use a transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Step 1: Add temporary suffix to avoid conflicts
      console.log("🔄 Step 1: Adding temporary suffixes to avoid conflicts...");
      
      for (let i = 0; i < existingPreferences.length && i < updatedPreferencesData.length; i++) {
        const pref = existingPreferences[i];
        const tempName = `${pref.name}_TEMP_${Date.now()}_${i}`;
        
        await tx
          .update(schema.preferences)
          .set({ name: tempName })
          .where(eq(schema.preferences.id, pref.id));
      }
      
      console.log("✅ Step 1 complete: All names temporarily renamed");
      
      // Step 2: Update to final names
      console.log("🔄 Step 2: Updating to final names...");
      
      for (let i = 0; i < existingPreferences.length && i < updatedPreferencesData.length; i++) {
        const pref = existingPreferences[i];
        const newName = updatedPreferencesData[i].name;
        
        console.log(`🔧 Updating ID ${pref.id}: "${pref.name}" → "${newName}"`);
        
        await tx
          .update(schema.preferences)
          .set({ name: newName })
          .where(eq(schema.preferences.id, pref.id));
      }
      
      console.log("✅ Step 2 complete: All names updated successfully");
    });
    
    console.log(`✨ Successfully updated ${Math.min(existingPreferences.length, updatedPreferencesData.length)} preferences!`);
    
  } catch (error) {
    console.error("❌ Error updating preferences:", error);
    throw error;
  }
};

await updatePreferences()