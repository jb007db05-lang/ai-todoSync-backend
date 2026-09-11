import assert from "node:assert/strict";
import test, { describe, before, after } from "node:test";
import mongoose from "mongoose";
import costControlService from "./cost-control.service.js";
import llmExecutionService from "./llm-execution.service.js";
import PromptExecutionLogModel from "../../prompt/models/prompt-execution-log.model.js";

describe("LLM Execution & Cost Control Service Unit Tests", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sync-todo-test",
      );
    }
  });

  after(async () => {
    await PromptExecutionLogModel.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test("Cost control service calculates cost accurately based on token pricing", () => {
    const mockModel = {
      modelId: "test-model",
      providerId: "test-provider",
      displayName: "Test Model",
      isEnabled: true,
      isDefault: false,
      contextWindow: 128000,
      maxOutputTokens: 4096,
      inputPricePerMToken: 1.0,
      outputPricePerMToken: 2.0,
      cachedInputPricePerMToken: 0.5,
      capabilities: ["text_generation"],
      supportedParameters: ["temperature"],
    };

    const cost = costControlService.calculateCost(
      mockModel as any,
      1000,
      500,
      0,
    );

    // 1000/1e6 * 1.0 = 0.001
    // 500/1e6 * 2.0  = 0.001
    // total = 0.002
    assert.equal(cost.totalCost, 0.002);
    assert.equal(cost.inputCost, 0.001);
    assert.equal(cost.outputCost, 0.001);
  });

  test("Error categorization classifies standard errors accurately", () => {
    assert.equal(
      llmExecutionService["categorizeError"]({
        status: 401,
        message: "Invalid API Key",
      }),
      "invalid_credentials",
    );
    assert.equal(
      llmExecutionService["categorizeError"]({
        status: 429,
        message: "Rate limit exceeded",
      }),
      "rate_limited",
    );
    assert.equal(
      llmExecutionService["categorizeError"]({ message: "Request timeout" }),
      "timeout",
    );
    assert.equal(
      llmExecutionService["categorizeError"](new Error("Unknown server error")),
      "provider_error",
    );
  });
});
