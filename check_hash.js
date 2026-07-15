import { deterministicHash } from "./src/utils/encryption.js";
import mongoose from "mongoose";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

const SdkIntegrationSchema = new mongoose.Schema({}, { strict: false });
const SdkIntegration = mongoose.model("SdkIntegration", SdkIntegrationSchema, "sdkintegrations");

async function checkHash() {
  const rawKey = "sdk_59e9d52bcba39f4d939187c702a8177d3de035b3baa15740";
  const hash = deterministicHash(rawKey);
  console.log("Raw Key:", rawKey);
  console.log("Hash:", hash);

  await mongoose.connect(MONGODB_URI);
  const matched = await SdkIntegration.findOne({ sdkKeyHash: hash }).lean();
  console.log("Matched integration in db:", matched);

  const all = await SdkIntegration.find({}).lean();
  console.log("\nAll integrations (sdkKeyHash):");
  all.forEach(i => {
    console.log(`- ${i.name}: hash=${i.sdkKeyHash}`);
  });

  await mongoose.disconnect();
}

checkHash().catch(console.error);
