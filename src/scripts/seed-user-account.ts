import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/pristine";
const TENANT_ID = "69e70c3d7c474f0f1337d982"; // tm_test1@yopmail.com

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: "pristine" });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB");

  // Create admin user with fixed ID
  const email = "tm_test1@yopmail.com";
  const password = "Password123!";
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  await db.collection("users").deleteOne({ _id: new mongoose.Types.ObjectId(TENANT_ID) });
  await db.collection("users").deleteOne({ email });

  const user = {
    _id: new mongoose.Types.ObjectId(TENANT_ID),
    email,
    password: passwordHash,
    name: "Test Admin",
    firstName: "Test",
    lastName: "Admin",
    role: "ADMIN",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection("users").insertOne(user);
  console.log("Seeded user:", email, "with ID:", TENANT_ID);

  await mongoose.disconnect();
}

main().catch(console.error);
