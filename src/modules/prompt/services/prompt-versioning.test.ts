import assert from "node:assert/strict";
import test, { describe, before, after } from "node:test";
import mongoose from "mongoose";
import promptLibraryService from "./prompt.service.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";

describe("Prompt Production Versioning Unit Tests", () => {
  const dummyWorkspaceId = new mongoose.Types.ObjectId().toString();
  const dummyUserId = new mongoose.Types.ObjectId().toString();
  let createdPromptId: string;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sync-todo-test",
      );
    }
    // Mock Workspace membership
    workspaceService.assertMembership = async () => ({}) as any;
  });

  after(async () => {
    if (createdPromptId) {
      await PromptLibraryModel.findByIdAndDelete(createdPromptId);
      await PromptVersionModel.deleteMany({ promptId: createdPromptId });
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test("Creating a prompt initializes unversioned template", async () => {
    const prompt = await promptLibraryService.createPrompt(
      dummyWorkspaceId,
      dummyUserId,
      {
        name: "Version Test Prompt",
        body: "Initial body {{ var1 }}",
        variables: [{ name: "var1", required: true }],
        category: "testing",
      },
    );

    createdPromptId = prompt._id.toString();
    assert.ok(prompt._id, "Prompt ID should exist");
    assert.equal(prompt.productionVersion, 1);
  });

  test("publishProductionVersion sets production version and publication timestamp", async () => {
    const updated = await promptLibraryService.updatePrompt(
      dummyWorkspaceId,
      dummyUserId,
      createdPromptId,
      { body: "Updated body for version 2" },
    );
    assert.equal(updated.version, 2);

    const published = await promptLibraryService.publishProductionVersion(
      dummyWorkspaceId,
      dummyUserId,
      createdPromptId,
      2,
    );

    assert.equal(published.productionVersion, 2);
    assert.ok(published.publishedAt, "publishedAt timestamp must be set");

    const fetched = await promptLibraryService.getPromptDetails(
      dummyWorkspaceId,
      dummyUserId,
      createdPromptId,
    );
    assert.equal(fetched.productionVersion, 2);
    assert.equal(fetched.isProductionPublished, true);
  });
});
