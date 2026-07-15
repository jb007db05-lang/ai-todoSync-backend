import mongoose from "mongoose";
import { deterministicHash } from "./src/utils/encryption.js";
import sdkIntegrationService from "./src/modules/sdk-integrations/service.js";
import env from "./src/config/env.js";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");
  console.log("ENCRYPTION_KEY:", env.ENCRYPTION_KEY);

  const rawKey = "sdk_58d1976a4bc2c8e0018f3a97:e822a10dfa6cbb8a3d52d9b213695df1:293bc0c14c51480f2d8c39e14bc08dcf284ee90fca7a39ba9db42a17cb2a9bf8c187bc9e14a0f44e138a08d2";
  const keyHash = deterministicHash(rawKey);
  console.log("Calculated keyHash:", keyHash);

  const integration = await sdkIntegrationService.resolveByKeyHash(keyHash);
  if (integration) {
    console.log("SUCCESS! Found integration:", integration.name);
    console.log("Status:", integration.status);
    console.log("TenantId:", integration.tenantId);
    
    const user = await sdkIntegrationService.resolveTenant(integration.tenantId);
    console.log("Resolved user (tenant):", user ? user.email || user._id : "NOT FOUND");
  } else {
    console.log("FAILURE! Integration not found for hash:", keyHash);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
