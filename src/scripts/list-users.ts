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
  const users = await db.collection("users").find({}).toArray();
  console.log("Users:", users.map(u => ({ email: u.email, role: u.role, tenantId: u.tenantId, id: u._id })));
  await mongoose.disconnect();
}

main().catch(console.error);
