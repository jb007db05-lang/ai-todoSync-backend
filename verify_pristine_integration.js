import mongoose from "mongoose";
import SdkIntegrationModel from "./src/modules/sdk-integrations/model.js";

async function run() {
  await mongoose.connect("mongodb://localhost:27017/pristine");
  const integrations = await SdkIntegrationModel.find({});
  console.log("Integrations in pristine db:");
  for (const integration of integrations) {
    console.log(`\n- Name: ${integration.name}`);
    console.log(`  ID: ${integration._id}`);
    console.log(`  Decrypted sdkKey (Plain-text): ${integration.sdkKey}`);
    console.log(`  Stored Hash: ${integration.sdkKeyHash}`);
    console.log(`  Status: ${integration.status}`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
