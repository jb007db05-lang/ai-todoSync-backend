import mongoose from "mongoose";
import UserModel from "../modules/auth/models/user.model.js";
import env from "../config/env.js";

async function test() {
  console.info("Connecting to database...");
  await mongoose.connect(env.MONGODB_URI);
  console.info("Connected.");

  try {
    const email = "test_encryption_" + Date.now() + "@example.com";
    console.info("Creating test user with email:", email);
    const user = new UserModel({
      email,
      password: "password123",
    });
    await user.save();

    console.info("Initial user keys configured:");
    console.info("openaiApiKeyConfigured:", !!user.openaiApiKey);

    console.info('Setting openaiApiKey to "test-secret-key-123"');
    user.openaiApiKey = "test-secret-key-123";
    console.info(
      "Immediate user.openaiApiKey value in memory:",
      user.openaiApiKey,
    );

    await user.save();
    console.info("Saved to DB.");

    const fetched = await UserModel.findById(user._id).exec();
    if (!fetched) {
      throw new Error("User not found after save");
    }

    console.info("Fetched user from DB:");
    console.info(
      "openaiApiKey value (decrypted via getter):",
      fetched.openaiApiKey,
    );
    console.info(
      "Raw document value from MongoDB (direct object):",
      fetched.toObject({ getters: false }).openaiApiKey,
    );
    console.info("openaiApiKeyConfigured flag:", !!fetched.openaiApiKey);

    // Clean up
    await UserModel.deleteOne({ _id: user._id });
    console.info("Test completed successfully.");
  } catch (error) {
    console.error("Error during test:", error);
  } finally {
    await mongoose.disconnect();
  }
}

test();
