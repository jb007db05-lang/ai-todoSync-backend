import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/ai-todosync";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

const ALGORITHM = "aes-256-gcm";

function decrypt(text: string): string {
  if (!text || !text.includes(":")) return text;
  try {
    const parts = text.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv,
    );
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err: any) {
    return `[DECRYPT ERROR: ${err.message}]`;
  }
}

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "pristine" });
  console.log("Connected to pristine database");

  const integrations = await mongoose.connection.db
    ?.collection("sdkintegrations")
    .find()
    .toArray();
  console.log("\nDecrypted SDK Integrations in 'pristine' DB:");
  for (const i of integrations || []) {
    const decrypted = decrypt(i.sdkKey);
    console.log(`- ID: ${i._id}`);
    console.log(`  Name: ${i.name}`);
    console.log(`  Status: ${i.status}`);
    console.log(`  Raw Key: ${decrypted}`);
    console.log(`  Key Hash: ${i.sdkKeyHash}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
