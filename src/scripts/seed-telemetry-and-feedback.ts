import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ai-todosync";
const TENANT_ID = "69e70c3d7c474f0f1337d982"; // tm_test1@yopmail.com
const API_KEY_ID = "69e74517fc6f64788b255a0b"; // "key 1"

async function main() {
  console.log("Connecting to MONGODB:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.");

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection is not initialized.");
  }

  // 1. Seed Sdk Integrations (so the user sees a connected integration under /sdk-integrations)
  console.log("Seeding SDK Integrations...");
  await db.collection("sdkintegrations").deleteMany({ tenantId: TENANT_ID });
  
  const sdkIntegration = {
    tenantId: TENANT_ID,
    name: "Sync Todo Production App",
    environment: "production",
    domain: "http://localhost:5174",
    description: "Production SDK connection for local sandbox telemetry and user guides",
    status: "connected",
    sdkKey: "sdk_58d1976a4bc2c8e0018f3a97:e822a10dfa6cbb8a3d52d9b213695df1:293bc0c14c51480f2d8c39e14bc08dcf284ee90fca7a39ba9db42a17cb2a9bf8c187bc9e14a0f44e138a08d2",
    sdkKeyHash: "d8c0b6214a0bc298df8e6cfd38aa906e5b9f9aa48d39c09bb173b9ec0654ea29",
    sdkVersion: "2.1.2",
    firstConnectedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    lastConnectedAt: new Date(Date.now() - 5 * 60 * 1000),
    lastRuntimeRequestAt: new Date(Date.now() - 10 * 60 * 1000),
    lastEventRequestAt: new Date(Date.now() - 5 * 60 * 1000),
    lastHeartbeatAt: new Date(Date.now() - 2 * 60 * 1000),
    connectionCount: 42,
    latestOrigin: "http://localhost:5174",
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
    updatedAt: new Date(),
  };

  await db.collection("sdkintegrations").insertOne(sdkIntegration);
  console.log("SDK Integration seeded.");

  // 2. Seed event registries & logs under apiKeyId: API_KEY_ID
  console.log("Seeding telemetry events...");
  await db.collection("analyticseventregistries").deleteMany({ apiKeyId: API_KEY_ID });
  await db.collection("analyticslogs").deleteMany({ apiKeyId: API_KEY_ID });

  const eventsToSeed = [
    { eventName: "subscription_purchased", count: 8, payloads: [
      { plan: "enterprise", price: 299, userId: "user_a" },
      { plan: "pro", price: 49, userId: "user_b" },
      { plan: "enterprise", price: 299, userId: "user_c" },
      { plan: "enterprise", price: 299, userId: "user_d" }
    ]},
    { eventName: "project_created", count: 15, payloads: [
      { workspace: "Marketing Board", owner: "user_a" },
      { workspace: "R&D Sprint 2", owner: "user_b" },
      { workspace: "Finance Audit", owner: "user_c" }
    ]},
    { eventName: "member_invited", count: 12, payloads: [
      { role: "collaborator", email: "new_member@example.com" },
      { role: "admin", email: "manager@example.com" }
    ]},
    { eventName: "survey_started", count: 24, payloads: [
      { surveyId: "6a54ab95daad8d081e4350f6" }
    ]},
    { eventName: "survey_completed", count: 18, payloads: [
      { surveyId: "6a54ab95daad8d081e4350f6" }
    ]},
    { eventName: "task_completed", count: 35, payloads: [
      { taskId: "task_1", priority: "HIGH" },
      { taskId: "task_2", priority: "MEDIUM" }
    ]}
  ];

  for (const item of eventsToSeed) {
    // Insert into registry
    const registryResult = await db.collection("analyticseventregistries").insertOne({
      eventName: item.eventName,
      apiKeyId: API_KEY_ID,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000)
    });

    const eventRefId = registryResult.insertedId.toString();

    // Insert multiple log entries
    for (let i = 0; i < item.count; i++) {
      const payloadTemplate = item.payloads[i % item.payloads.length] || {};
      const randomMinutes = Math.floor(Math.random() * 120) + 5;
      const createdAt = new Date(Date.now() - randomMinutes * 60 * 1000);
      
      await db.collection("analyticslogs").insertOne({
        eventId: eventRefId,
        eventRef: eventRefId,
        apiKeyId: API_KEY_ID,
        userIdentifier: `simulated_user_${Math.floor(Math.random() * 10) + 1}`,
        sessionId: `session_${Math.random().toString(36).substring(2, 10)}`,
        payload: {
          ...payloadTemplate,
          timestamp: createdAt.toISOString(),
          context: {
            page: { url: "http://localhost:5174/dashboard" },
            device: { os: "Linux", browser: "Chrome", screen: "1920x1080" },
            library: { name: "engagement-sdk-js", version: "2.1.2" }
          }
        },
        createdAt
      });
    }
  }
  console.log("Telemetry events seeded.");

  // 3. Seed Survey Responses for both surveys: "6a4f8f67d9bd44b5e714b42b" and "6a54ab95daad8d081e4350f6"
  console.log("Seeding survey responses...");
  await db.collection("surveyresponses").deleteMany({ tenantId: TENANT_ID });

  // Responses for NPS pulse ("6a4f8f67d9bd44b5e714b42b")
  const survey1Responses = [
    { npsScore: 10, category: "PROMOTER", answers: [{ questionId: "f9c9b7e4-47a8-4a94-a3b3-63ce750448f7", questionTitle: "How likely are you to recommend Sync Todo?", questionType: "NPS", value: 10 }] },
    { npsScore: 9, category: "PROMOTER", answers: [{ questionId: "f9c9b7e4-47a8-4a94-a3b3-63ce750448f7", questionTitle: "How likely are you to recommend Sync Todo?", questionType: "NPS", value: 9 }] },
    { npsScore: 8, category: "PASSIVE", answers: [{ questionId: "f9c9b7e4-47a8-4a94-a3b3-63ce750448f7", questionTitle: "How likely are you to recommend Sync Todo?", questionType: "NPS", value: 8 }] },
    { npsScore: 7, category: "PASSIVE", answers: [{ questionId: "f9c9b7e4-47a8-4a94-a3b3-63ce750448f7", questionTitle: "How likely are you to recommend Sync Todo?", questionType: "NPS", value: 7 }] },
    { npsScore: 4, category: "DETRACTOR", answers: [{ questionId: "f9c9b7e4-47a8-4a94-a3b3-63ce750448f7", questionTitle: "How likely are you to recommend Sync Todo?", questionType: "NPS", value: 4 }] }
  ];

  // Responses for NPS billing survey ("6a54ab95daad8d081e4350f6")
  const survey2Responses = [
    { npsScore: 10, category: "PROMOTER", answers: [
      { questionId: "q-1", questionTitle: "How likely are you to recommend SyncTask to a colleague?", questionType: "NPS", value: 10 },
      { questionId: "q-2", questionTitle: "What's the main reason for your score?", questionType: "TEXTAREA", value: "Absolutely love the new real-time sync speed. It has made collaboration super smooth!" }
    ]},
    { npsScore: 10, category: "PROMOTER", answers: [
      { questionId: "q-1", questionTitle: "How likely are you to recommend SyncTask to a colleague?", questionType: "NPS", value: 10 },
      { questionId: "q-2", questionTitle: "What's the main reason for your score?", questionType: "TEXTAREA", value: "Great developer onboarding tours. Got it integrated in under 5 minutes!" }
    ]},
    { npsScore: 9, category: "PROMOTER", answers: [
      { questionId: "q-1", questionTitle: "How likely are you to recommend SyncTask to a colleague?", questionType: "NPS", value: 9 },
      { questionId: "q-2", questionTitle: "What's the main reason for your score?", questionType: "TEXTAREA", value: "The telemetry event tracking is very robust and reliable." }
    ]},
    { npsScore: 8, category: "PASSIVE", answers: [
      { questionId: "q-1", questionTitle: "How likely are you to recommend SyncTask to a colleague?", questionType: "NPS", value: 8 },
      { questionId: "q-2", questionTitle: "What's the main reason for your score?", questionType: "TEXTAREA", value: "It does the job well, but it would be nice to have dark mode in the dashboard." }
    ]},
    { npsScore: 5, category: "DETRACTOR", answers: [
      { questionId: "q-1", questionTitle: "How likely are you to recommend SyncTask to a colleague?", questionType: "NPS", value: 5 },
      { questionId: "q-2", questionTitle: "What's the main reason for your score?", questionType: "TEXTAREA", value: "Mismatched mapping properties in the SDK caused a crash originally, but it works now." }
    ]}
  ];

  for (const resp of survey1Responses) {
    await db.collection("surveyresponses").insertOne({
      surveyId: "6a4f8f67d9bd44b5e714b42b",
      userId: `simulated_user_${Math.floor(Math.random() * 20) + 1}`,
      tenantId: TENANT_ID,
      sessionId: `session_${Math.random().toString(36).substring(2, 10)}`,
      answers: resp.answers,
      npsScore: resp.npsScore,
      category: resp.category,
      metadata: { seededByDemo: true },
      submittedAt: new Date(Date.now() - Math.floor(Math.random() * 48) * 3600 * 1000)
    });
  }

  for (const resp of survey2Responses) {
    await db.collection("surveyresponses").insertOne({
      surveyId: "6a54ab95daad8d081e4350f6",
      userId: `simulated_user_${Math.floor(Math.random() * 20) + 1}`,
      tenantId: TENANT_ID,
      sessionId: `session_${Math.random().toString(36).substring(2, 10)}`,
      answers: resp.answers,
      npsScore: resp.npsScore,
      category: resp.category,
      metadata: { seededByDemo: true },
      submittedAt: new Date(Date.now() - Math.floor(Math.random() * 48) * 3600 * 1000)
    });
  }

  console.log("Survey responses seeded.");
  await mongoose.disconnect();
  console.log("Disconnected.");
}

main().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
