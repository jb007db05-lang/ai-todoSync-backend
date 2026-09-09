import mongoose from "mongoose";
import SdkIntegrationModel from "./src/modules/sdk-integrations/model.js";
import { deterministicHash } from "./src/utils/encryption.js";
import env from "./src/config/env.js";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

async function run() {
  await mongoose.connect(MONGODB_URI);
  const integrations = await SdkIntegrationModel.find({});
  console.log("Encryption Key:", env.ENCRYPTION_KEY);
  for (const integration of integrations) {
    const rawObject = integration.toObject({ getters: false });
    const rawKey = rawObject.sdkKey;
    const storedHash = rawObject.sdkKeyHash;
    const computedHash = deterministicHash(rawKey);
    console.log(`\n- Integration: "${integration.name}"`);
    console.log(`  Raw Key in DB:   ${rawKey}`);
    console.log(`  Stored Hash:     ${storedHash}`);
    console.log(`  Computed Hash:   ${computedHash}`);
    console.log(`  Do they match?   ${storedHash === computedHash}`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
