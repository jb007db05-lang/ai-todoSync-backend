import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import authService from "./auth.service.js";
import UserModel from "../models/user.model.js";
import { EmailService } from "./email.service.js";

// Helper helper mock
function makeMockQuery(result: any) {
  return {
    exec: async () => result,
  };
}

test("AuthService: forgotPassword generates OTP and triggers verification email", async () => {
  let sentEmail: string | null = null;
  let sentOtp: string | null = null;
  let sentType: string | null = null;

  // Mock EmailService
  const originalSendOtpEmail = EmailService.sendOtpEmail;
  EmailService.sendOtpEmail = async (
    to: string,
    otp: string,
    purpose: "forgot_password" | "2fa",
  ): Promise<boolean> => {
    sentEmail = to;
    sentOtp = otp;
    sentType = purpose;
    return true;
  };

  // Mock User Document
  let saved = false;
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "test@example.com",
    passwordResetCode: null as string | null,
    passwordResetCodeExpiresAt: null as Date | null,
    save: async () => {
      saved = true;
    },
  };

  // Mock UserModel.findOne
  const originalFindOne = UserModel.findOne;
  UserModel.findOne = function (query: any) {
    if (query.email === "test@example.com") {
      return makeMockQuery(mockUser) as any;
    }
    return makeMockQuery(null) as any;
  };

  try {
    await authService.forgotPassword("test@example.com");

    assert.ok(saved);
    assert.equal(sentEmail, "test@example.com");
    assert.ok(sentOtp);
    assert.equal((sentOtp as string).length, 6);
    assert.equal(sentType, "forgot_password");
    assert.equal(mockUser.passwordResetCode, sentOtp);
    assert.ok(mockUser.passwordResetCodeExpiresAt);
  } finally {
    // Restore
    EmailService.sendOtpEmail = originalSendOtpEmail;
    UserModel.findOne = originalFindOne;
  }
});

test("AuthService: verifyOtp resets password when correct OTP is supplied", async () => {
  let saved = false;
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "test@example.com",
    password: "oldPassword",
    passwordResetCode: "123456",
    passwordResetCodeExpiresAt: new Date(Date.now() + 5000), // Valid
    save: async () => {
      saved = true;
    },
  };

  const originalFindOne = UserModel.findOne;
  UserModel.findOne = function (query: any) {
    if (query.email === "test@example.com") {
      return makeMockQuery(mockUser) as any;
    }
    return makeMockQuery(null) as any;
  };

  try {
    // 1. Success reset
    await authService.verifyOtp(
      "test@example.com",
      "123456",
      "newSuperPassword123!",
    );
    assert.ok(saved);
    assert.equal(mockUser.password, "newSuperPassword123!");
    assert.equal(mockUser.passwordResetCode, null);
    assert.equal(mockUser.passwordResetCodeExpiresAt, null);

    // 2. Reject expired reset
    mockUser.passwordResetCode = "123456";
    mockUser.passwordResetCodeExpiresAt = new Date(Date.now() - 5000); // Expired
    await assert.rejects(async () => {
      await authService.verifyOtp("test@example.com", "123456", "pass");
    }, /expired or is invalid/);

    // 3. Reject wrong OTP
    mockUser.passwordResetCode = "123456";
    mockUser.passwordResetCodeExpiresAt = new Date(Date.now() + 5000);
    await assert.rejects(async () => {
      await authService.verifyOtp("test@example.com", "999999", "pass");
    }, /Invalid OTP/);
  } finally {
    UserModel.findOne = originalFindOne;
  }
});

test("AuthService: toggle2FA updates user document settings", async () => {
  let saved = false;
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "test@example.com",
    syncApiKey: "key123",
    twoFactorEnabled: false,
    save: async () => {
      saved = true;
    },
  };

  const originalFindById = UserModel.findById;
  UserModel.findById = function (id: any) {
    return makeMockQuery(mockUser) as any;
  };

  try {
    const result = await authService.toggle2FA(mockUser._id.toString(), true);
    assert.ok(saved);
    assert.equal(mockUser.twoFactorEnabled, true);
    assert.equal(result.twoFactorEnabled, true);
  } finally {
    UserModel.findById = originalFindById;
  }
});
