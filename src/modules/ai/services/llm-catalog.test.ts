import assert from "node:assert/strict";
import test, { describe, before, after } from "node:test";
import mongoose from "mongoose";
import llmCatalogService from "./llm-catalog.service.js";
import LlmProviderModel from "../models/llm-provider.model.js";
import LlmModelModel from "../models/llm-model.model.js";

describe("LLM Catalog Service Unit Tests", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sync-todo-test",
      );
    }
  });

  after(async () => {
    await LlmProviderModel.deleteMany({});
    await LlmModelModel.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test("seedDefaultCatalog populates provider and model records", async () => {
    await llmCatalogService.initializeCatalogIfNeeded();

    const providers = await llmCatalogService.getProviders();
    assert.ok(providers.length >= 4, "Should have seeded at least 4 providers");

    const providerIds = providers.map((p) => p.providerId);
    assert.ok(
      providerIds.includes("gemini"),
      "Catalog must include Gemini provider",
    );
    assert.ok(
      providerIds.includes("openai"),
      "Catalog must include OpenAI provider",
    );
    assert.ok(
      providerIds.includes("anthropic"),
      "Catalog must include Anthropic provider",
    );

    const models = await llmCatalogService.getModels();
    assert.ok(models.length >= 5, "Should have seeded at least 5 models");
  });

  test("getModels(providerId) filters models accurately", async () => {
    const geminiModels = await llmCatalogService.getModels("gemini");
    assert.ok(geminiModels.length > 0, "Should return Gemini models");
    for (const model of geminiModels) {
      assert.equal(model.providerId, "gemini");
    }
  });

  test("getModelDetails returns model pricing and context window", async () => {
    const model = await llmCatalogService.getModelDetails("gemini-3.6-flash");
    assert.ok(model, "Model gemini-3.6-flash should exist");
    if (model) {
      assert.equal(model.modelId, "gemini-3.6-flash");
      assert.equal(model.providerId, "gemini");
      assert.equal(typeof model.contextWindow, "number");
      assert.equal(typeof model.outputPricePerMToken, "number");
    }
  });
});
