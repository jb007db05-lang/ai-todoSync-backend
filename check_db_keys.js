import mongoose from "mongoose";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

// Define a schema to read the integrations/keys
const SdkIntegrationSchema = new mongoose.Schema({}, { strict: false });
const SdkIntegration = mongoose.model("SdkIntegration", SdkIntegrationSchema, "sdkintegrations");

const AnalyticsKeySchema = new mongoose.Schema({}, { strict: false });
const AnalyticsKey = mongoose.model("AnalyticsKey", AnalyticsKeySchema, "analyticskeys");

async function checkKeys() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const integrations = await SdkIntegration.find({}).lean();
  console.log("\n--- SDK Integrations ---");
  console.log(JSON.stringify(integrations, null, 2));

  const keys = await AnalyticsKey.find({}).lean();
  console.log("\n--- Analytics Keys ---");
  console.log(JSON.stringify(keys, null, 2));

  await mongoose.disconnect();
}

checkKeys().catch(console.error);
