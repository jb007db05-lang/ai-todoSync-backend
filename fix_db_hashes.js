import mongoose from "mongoose";
import SdkIntegrationModel from "./src/modules/sdk-integrations/model.js";
import { deterministicHash } from "./src/utils/encryption.js";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const integrations = await SdkIntegrationModel.find({});
  for (const integration of integrations) {
    const rawObject = integration.toObject({ getters: false });
    const rawKey = rawObject.sdkKey;
    const computedHash = deterministicHash(rawKey);
    console.log(`Updating "${integration.name}": stored=${rawObject.sdkKeyHash} -> computed=${computedHash}`);
    
    // We update using updateOne to bypass Mongoose setters/getters
    await SdkIntegrationModel.updateOne(
      { _id: integration._id },
      { $set: { sdkKeyHash: computedHash } }
    );
  }

  console.log("All SDK Integration hashes updated successfully!");
  await mongoose.disconnect();
}

run().catch(console.error);
