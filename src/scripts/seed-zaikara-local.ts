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

if (!ENCRYPTION_KEY) {
  console.error("ERROR: ENCRYPTION_KEY is not defined in backend/.env");
  process.exit(1);
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv,
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function deterministicHash(text: string): string {
  if (!text) return "";
  return crypto.createHmac("sha256", ENCRYPTION_KEY).update(text).digest("hex");
}

async function run() {
  console.log("Connecting to MongoDB pristine...");
  await mongoose.connect("mongodb://localhost:27017/pristine");
  console.log("Connected.");

  const tenantId = "6a55f1af89f6d79a68903914"; // nairaditya2003@gmail.com

  // 1. Create or get SdkIntegration for zaikara-local
  let integration = await mongoose.connection
    .db!.collection("sdkintegrations")
    .findOne({
      tenantId,
      name: "zaikara-local",
    });

  if (!integration) {
    const rawKey = `sdk_${crypto.randomBytes(24).toString("hex")}`;
    const encryptedKey = encrypt(rawKey);
    const keyHash = deterministicHash(rawKey);

    const result = await mongoose.connection
      .db!.collection("sdkintegrations")
      .insertOne({
        tenantId,
        name: "zaikara-local",
        environment: "development",
        domain: "http://localhost:5174",
        allowedOrigins: ["http://localhost:5174", "http://localhost:5175"],
        description: "Local Zaikara SDK Integration",
        status: "connected",
        sdkKey: encryptedKey,
        sdkKeyHash: keyHash,
        connectionCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    integration = await mongoose.connection
      .db!.collection("sdkintegrations")
      .findOne({ _id: result.insertedId });
    console.log("Created integration:", integration);
  } else {
    // Ensure status is connected
    await mongoose.connection
      .db!.collection("sdkintegrations")
      .updateOne(
        { _id: integration._id },
        { $set: { status: "connected", updatedAt: new Date() } },
      );
    integration = await mongoose.connection
      .db!.collection("sdkintegrations")
      .findOne({ _id: integration._id });
    console.log("Existing integration configured:", integration);
  }

  // 2. Create Guide for zaikara-local integration
  // Clean old guides for this integration to avoid duplicates
  await mongoose.connection.db!.collection("guides").deleteMany({
    sdkIntegrationId: integration!._id.toString(),
  });

  const guide = {
    tenantId,
    sdkIntegrationId: integration!._id.toString(),
    title: "Welcome to Zaikara",
    description: "Get started with the Zaikara platform.",
    type: "TOUR",
    status: "LIVE",
    theme: {},
    priority: "MEDIUM",
    targetingRules: {
      id: crypto.randomUUID(),
      operator: "AND",
      conditions: [
        {
          id: crypto.randomUUID(),
          type: "URL_CONTAINS",
          operator: "CONTAINS",
          value: "/dashboard",
        },
      ],
      groups: [],
    },
    frequencyRules: {
      showOncePerSession: true,
      cooldownHours: 24,
      maxDisplays: 5,
    },
    scheduleRules: {},
    steps: [
      {
        id: crypto.randomUUID(),
        title: "Welcome to Zaikara",
        description: "Get started with the Zaikara platform.",
        selector: "[data-tour='onboarding']",
        placement: "CENTER",
        actionType: "NEXT",
        nextStep: null,
      },
    ],
    analytics: {},
    metadata: {},
    version: 1,
    versions: [],
    createdBy: tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const guideResult = await mongoose.connection
    .db!.collection("guides")
    .insertOne(guide);
  console.log("Created onboarding guide:", guideResult.insertedId);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(console.error);
