import mongoose from "mongoose";
import SdkIntegrationModel from "./src/modules/sdk-integrations/model.js";
import { deterministicHash } from "./src/utils/encryption.js";
import env from "./src/config/env.js";

async function run() {
  const dbs = ["ai-todosync", "pristine"];
  console.log("Encryption Key:", env.ENCRYPTION_KEY);
  for (const dbName of dbs) {
    const uri = `mongodb://localhost:27017/${dbName}`;
    await mongoose.connect(uri);
    console.log(`\n=== Database: ${dbName} ===`);
    const integrations = await SdkIntegrationModel.find({});
    for (const integration of integrations) {
      const rawObject = integration.toObject({ getters: false });
      const rawKey = rawObject.sdkKey;
      const storedHash = rawObject.sdkKeyHash;
      const computedHash = deterministicHash(rawKey);
      console.log(`- Integration: "${integration.name}"`);
      console.log(`  Raw Key:       ${rawKey}`);
      console.log(`  Stored Hash:   ${storedHash}`);
      console.log(`  Computed Hash: ${computedHash}`);
      console.log(`  Match?         ${storedHash === computedHash}`);
    }
    await mongoose.disconnect();
  }
}

run().catch(console.error);
