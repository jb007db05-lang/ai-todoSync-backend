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
  
  const collections = await db.listCollections().toArray();
  console.log("Collections:");
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`- ${col.name}: ${count} docs`);
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
