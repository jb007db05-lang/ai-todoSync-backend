import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  console.log("Connecting to MongoDB pristine...");
  await mongoose.connect("mongodb://localhost:27017/pristine");
  console.log("Connected.");

  const tenantId = "6a55f1af89f6d79a68903914"; // nairaditya2003@gmail.com
  const sdkIntegrationId = "6a5716e868d60451ecdbcbc1"; // Zaikara Local ID

  // 1. Update SDK Integration status and properties
  console.log("Configuring SDK integration...");
  await mongoose.connect("mongodb://localhost:27017/pristine");
  const db = mongoose.connection.db!;
  const sdkintegrations = db.collection("sdkintegrations");

  const integration = await sdkintegrations.findOne({
    _id: new mongoose.Types.ObjectId(sdkIntegrationId),
  });
  if (!integration) {
    console.error("Zaikara Local integration not found! Check ID.");
    process.exit(1);
  }

  await sdkintegrations.updateOne(
    { _id: integration._id },
    {
      $set: {
        status: "connected",
        domain: "http://localhost:5174",
        allowedOrigins: ["http://localhost:5174", "http://localhost:5175"],
        updatedAt: new Date(),
      },
    },
  );
  console.log("SDK Integration updated successfully to connected.");

  // 2. Clear old guides and surveys for Zaikara Local
  console.log("Clearing existing guides and surveys for this integration...");
  await db.collection("guides").deleteMany({ sdkIntegrationId });
  await db.collection("surveys").deleteMany({ sdkIntegrationId });

  // 3. Create Guide
  const guide = {
    tenantId,
    sdkIntegrationId,
    title: "Welcome to Zaikara",
    description: "Get started with the Zaikara platform.",
    type: "TOUR",
    status: "LIVE",
    theme: {},
    priority: "HIGH",
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
      showOnceEver: true,
    },
    scheduleRules: {},
    steps: [
      {
        id: crypto.randomUUID(),
        title: "Welcome to Zaikara",
        description:
          "This is the Dashboard. Here you can track your operations and yield vector analysis.",
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

  const guideResult = await db.collection("guides").insertOne(guide);
  console.log("Created onboarding guide with ID:", guideResult.insertedId);

  // 4. Create NPS Survey
  const survey = {
    tenantId,
    sdkIntegrationId,
    title: "NPS pulse",
    description: "Help us improve Zaikara",
    status: "LIVE",
    priority: "HIGH",
    questions: [
      {
        id: "nps-q-1",
        type: "NPS",
        title: "How likely are you to recommend Zaikara to a colleague?",
        description:
          "Scale from 0 (Not at all likely) to 10 (Extremely likely)",
        required: true,
        options: [],
        min: 0,
        max: 10,
      },
    ],
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
    triggerRules: {
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
      showOnceEver: true,
    },
    scheduleRules: {},
    analytics: {},
    metadata: {},
    createdBy: tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const surveyResult = await db.collection("surveys").insertOne(survey);
  console.log("Created NPS survey with ID:", surveyResult.insertedId);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(console.error);
