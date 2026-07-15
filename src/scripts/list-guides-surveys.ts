import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/pristine";

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: "pristine" });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB");
  
  console.log("=== GUIDES ===");
  const guides = await db.collection("guides").find({}).toArray();
  for (const g of guides) {
    console.log(`Guide ID: ${g._id}`);
    console.log(`  Title: ${g.title}`);
    console.log(`  Tenant ID: ${g.tenantId}`);
    console.log(`  SDK Integration ID: ${g.sdkIntegrationId}`);
    console.log(`  Status: ${g.status}`);
    console.log(`  Steps:`, JSON.stringify(g.steps, null, 2));
    console.log(`  Targeting Rules:`, JSON.stringify(g.targetingRules, null, 2));
  }
  
  console.log("=== SURVEYS ===");
  const surveys = await db.collection("surveys").find({}).toArray();
  for (const s of surveys) {
    console.log(`Survey ID: ${s._id}`);
    console.log(`  Title: ${s.title}`);
    console.log(`  Tenant ID: ${s.tenantId}`);
    console.log(`  SDK Integration ID: ${s.sdkIntegrationId}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Targeting Rules:`, JSON.stringify(s.targetingRules, null, 2));
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
