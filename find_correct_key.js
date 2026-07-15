import mongoose from "mongoose";
import SdkIntegrationModel from "./src/modules/sdk-integrations/model.js";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

async function run() {
  await mongoose.connect(MONGODB_URI);
  const integration = await SdkIntegrationModel.findOne({ name: "Sync Todo Production App" });
  if (integration) {
    console.log("Model JS object sdkKey:", integration.sdkKey);
    console.log("Model JS object sdkKeyHash:", integration.sdkKeyHash);
    console.log("Raw object from db (toObject):", integration.toObject({ getters: false }));
  } else {
    console.log("Integration not found!");
  }
  await mongoose.disconnect();
}

run().catch(console.error);
