import mongoose from 'mongoose';
import UserModel from '../models/user.model.js';
import env from '../config/env.js';

async function test() {
  console.log('Connecting to database...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected.');

  try {
    const email = 'test_encryption_' + Date.now() + '@example.com';
    console.log('Creating test user with email:', email);
    const user = new UserModel({
      email,
      password: 'password123',
    });
    await user.save();

    console.log('Initial user keys configured:');
    console.log('openaiApiKeyConfigured:', !!user.openaiApiKey);

    console.log('Setting openaiApiKey to "test-secret-key-123"');
    user.openaiApiKey = 'test-secret-key-123';
    console.log('Immediate user.openaiApiKey value in memory:', user.openaiApiKey);
    
    await user.save();
    console.log('Saved to DB.');

    const fetched = await UserModel.findById(user._id).exec();
    if (!fetched) {
      throw new Error('User not found after save');
    }

    console.log('Fetched user from DB:');
    console.log('openaiApiKey value (decrypted via getter):', fetched.openaiApiKey);
    console.log('Raw document value from MongoDB (direct object):', fetched.toObject({ getters: false }).openaiApiKey);
    console.log('openaiApiKeyConfigured flag:', !!fetched.openaiApiKey);

    // Clean up
    await UserModel.deleteOne({ _id: user._id });
    console.log('Test completed successfully.');
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await mongoose.disconnect();
  }
}

test();
