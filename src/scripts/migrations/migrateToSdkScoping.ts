import crypto from "crypto";
import { connectDatabase, disconnectDatabase } from "../../config/db.config.js";
import GuideModel from "../../modules/guides/model.js";
import { SurveyModel, SurveyResponseModel } from "../../modules/surveys/model.js";
import AnalyticsEventRegistryModel from "../../models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../../models/analytics-log.model.js";
import SdkIntegrationModel from "../../modules/sdk-integrations/model.js";
import AnalyticsKeyModel from "../../models/analytics-key.model.js";
import { deterministicHash } from "../../utils/encryption.js";
import logger from "../../lib/logger.js";

const generateSdkKey = (): string =>
  `sdk_${crypto.randomBytes(24).toString("hex")}`;

async function runMigration() {
  logger.info("Starting SDK Scoping Migration...");
  await connectDatabase();

  // Helper map: tenantId -> SdkIntegration document ID
  const tenantIntegrationMap = new Map<string, string>();

  // 1. Resolve or create SDK integrations for all unique tenants in Guides, Surveys, or legacy AnalyticsKeys
  const uniqueTenants = new Set<string>();

  const guides = await GuideModel.find({}).lean().exec();
  guides.forEach((g) => {
    if (g.tenantId) uniqueTenants.add(g.tenantId);
  });

  const surveys = await SurveyModel.find({}).lean().exec();
  surveys.forEach((s) => {
    if (s.tenantId) uniqueTenants.add(s.tenantId);
  });

  const legacyKeys = await AnalyticsKeyModel.find({}).lean().exec();
  legacyKeys.forEach((k) => {
    if (k.userId) uniqueTenants.add(k.userId);
  });

  logger.info(`Found ${uniqueTenants.size} unique tenants to check/backfill.`);

  for (const tenantId of uniqueTenants) {
    // Check if tenant already has an integration
    let integration = await SdkIntegrationModel.findOne({ tenantId }).exec();
    if (!integration) {
      logger.info(`Creating default SDK Integration for tenant ${tenantId}...`);
      const rawKey = generateSdkKey();
      const keyHash = deterministicHash(rawKey);
      integration = await SdkIntegrationModel.create({
        tenantId,
        name: "Default Integration",
        environment: "production",
        domain: "http://localhost:3000",
        allowedOrigins: ["http://localhost:3000", "http://localhost:5173"],
        description: "Auto-created during SDK scoping migration",
        status: "connected",
        sdkKey: rawKey,
        sdkKeyHash: keyHash,
        connectionCount: 0,
      });
      logger.info(`Created default integration ID ${integration._id} for tenant ${tenantId}.`);
    }
    tenantIntegrationMap.set(tenantId, integration._id.toString());
  }

  // Helper map: apiKeyId -> SdkIntegration ID
  const keyToIntegrationMap = new Map<string, string>();
  for (const key of legacyKeys) {
    const integrationId = tenantIntegrationMap.get(key.userId);
    if (integrationId) {
      keyToIntegrationMap.set(key._id.toString(), integrationId);
    }
  }

  // 2. Migrate Guides
  logger.info("Migrating Guides...");
  let guideCount = 0;
  for (const guide of guides) {
    if (!guide.sdkIntegrationId) {
      const integrationId = tenantIntegrationMap.get(guide.tenantId);
      if (integrationId) {
        await GuideModel.updateOne(
          { _id: guide._id },
          { $set: { sdkIntegrationId: integrationId } }
        );
        guideCount++;
      } else {
        logger.warn(`Could not resolve integration for Guide ${guide._id} (tenant ${guide.tenantId})`);
      }
    }
  }
  logger.info(`Migrated ${guideCount} Guides.`);

  // 3. Migrate Surveys
  logger.info("Migrating Surveys...");
  let surveyCount = 0;
  for (const survey of surveys) {
    if (!survey.sdkIntegrationId) {
      const integrationId = tenantIntegrationMap.get(survey.tenantId);
      if (integrationId) {
        await SurveyModel.updateOne(
          { _id: survey._id },
          { $set: { sdkIntegrationId: integrationId } }
        );
        surveyCount++;
      } else {
        logger.warn(`Could not resolve integration for Survey ${survey._id} (tenant ${survey.tenantId})`);
      }
    }
  }
  logger.info(`Migrated ${surveyCount} Surveys.`);

  // 4. Migrate Survey Responses
  logger.info("Migrating Survey Responses...");
  const surveyResponses = await SurveyResponseModel.find({}).lean().exec();
  let surveyResponseCount = 0;
  for (const response of surveyResponses) {
    if (!response.sdkIntegrationId) {
      const integrationId = tenantIntegrationMap.get(response.tenantId);
      if (integrationId) {
        await SurveyResponseModel.updateOne(
          { _id: response._id },
          { $set: { sdkIntegrationId: integrationId } }
        );
        surveyResponseCount++;
      }
    }
  }
  logger.info(`Migrated ${surveyResponseCount} Survey Responses.`);

  // 5. Migrate Event Registry
  logger.info("Migrating Event Registry...");
  const registryEvents = await AnalyticsEventRegistryModel.find({}).lean().exec();
  let registryCount = 0;
  for (const event of registryEvents) {
    if (!event.sdkIntegrationId) {
      const integrationId = keyToIntegrationMap.get(event.apiKeyId || "");
      if (integrationId) {
        await AnalyticsEventRegistryModel.updateOne(
          { _id: event._id },
          { $set: { sdkIntegrationId: integrationId } }
        );
        registryCount++;
      } else {
        // Fallback: check if we can map by owner (though registry doesn't have tenantId directly)
        logger.warn(`Could not resolve integration for Event Registry ${event._id} (apiKeyId ${event.apiKeyId})`);
      }
    }
  }
  logger.info(`Migrated ${registryCount} Event Registry documents.`);

  // 6. Migrate Event Logs
  logger.info("Migrating Event Logs...");
  const logs = await AnalyticsLogModel.find({}).lean().exec();
  let logCount = 0;
  for (const log of logs) {
    if (!log.sdkIntegrationId) {
      const integrationId = keyToIntegrationMap.get(log.apiKeyId || "");
      if (integrationId) {
        await AnalyticsLogModel.updateOne(
          { _id: log._id },
          { $set: { sdkIntegrationId: integrationId } }
        );
        logCount++;
      } else {
        logger.warn(`Could not resolve integration for Log ${log._id} (apiKeyId ${log.apiKeyId})`);
      }
    }
  }
  logger.info(`Migrated ${logCount} Event Logs.`);

  logger.info("SDK Scoping Migration completed successfully!");
  await disconnectDatabase();
}

runMigration().catch((error) => {
  logger.error("Migration failed:", error);
  process.exit(1);
});
