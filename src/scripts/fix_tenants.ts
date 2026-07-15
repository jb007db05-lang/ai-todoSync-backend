import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect("mongodb://localhost:27017/pristine");
  console.log("Connected.");

  const db = mongoose.connection.db!;

  // Find target user
  const targetUser = await db
    .collection("users")
    .findOne({ email: "nairadityasunil2003@gmail.com" });
  if (!targetUser) {
    console.error("Target user nairadityasunil2003@gmail.com not found!");
    process.exit(1);
  }

  const newTenantId = targetUser._id.toString();
  const oldTenantId = "6a55f1af89f6d79a68903914";

  console.log(
    `Mapping resources from old tenant [${oldTenantId}] to new tenant [${newTenantId}]...`,
  );

  // Update collections
  const collections = [
    "sdkintegrations",
    "guides",
    "surveys",
    "guideexposures",
    "surveyresponses",
  ];
  for (const collName of collections) {
    const coll = db.collection(collName);
    const count = await coll.countDocuments({ tenantId: oldTenantId });
    if (count > 0) {
      console.log(`Updating ${count} documents in '${collName}'...`);
      await coll.updateMany(
        { tenantId: oldTenantId },
        { $set: { tenantId: newTenantId } },
      );
    } else {
      console.log(`No documents found with old tenant ID in '${collName}'.`);
    }
  }

  console.log("Tenant IDs fixed successfully.");
  await mongoose.disconnect();
}

run().catch(console.error);
