import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { Document } from "mongoose";
import { Schema, model } from "mongoose";
import { encrypt, decrypt } from "../utils/encryption.js";

export interface IUser {
  email: string;
  password: string | null;
  syncApiKey: string;
  authProvider: "local" | "google";
  googleId?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document {
  comparePassword(candidate: string): Promise<boolean>;
  regenerateSyncApiKey(): string;
}

const generateSyncApiKey = () => randomBytes(32).toString("hex");

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      default: null,
    },
    syncApiKey: {
      type: String,
      required: true,
      default: generateSyncApiKey,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      required: true,
      default: "local",
    },
    googleId: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    firstName: {
      type: String,
      trim: true,
      default: null,
    },
    lastName: {
      type: String,
      trim: true,
      default: null,
    },
    openaiApiKey: {
      type: String,
      default: null,
      get: (v: string) => {
        if (!v) return v;
        try {
          return decrypt(v);
        } catch {
          return v;
        }
      },
      set: (v: string) => {
        if (v && !v.includes(":")) {
          return encrypt(v);
        }
        return v;
      },
    },
    anthropicApiKey: {
      type: String,
      default: null,
      get: (v: string) => {
        if (!v) return v;
        try {
          return decrypt(v);
        } catch {
          return v;
        }
      },
      set: (v: string) => {
        if (v && !v.includes(":")) {
          return encrypt(v);
        }
        return v;
      },
    },
    geminiApiKey: {
      type: String,
      default: null,
      get: (v: string) => {
        if (!v) return v;
        try {
          return decrypt(v);
        } catch {
          return v;
        }
      },
      set: (v: string) => {
        if (v && !v.includes(":")) {
          return encrypt(v);
        }
        return v;
      },
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

userSchema.pre<IUserDocument>("save", async function () {
  if (!this.isModified("password") || this.password == null) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidate: string) {
  if (this.password == null) {
    return false;
  }

  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.regenerateSyncApiKey = function () {
  this.syncApiKey = generateSyncApiKey();
  return this.syncApiKey;
};

const UserModel = model<IUserDocument>("User", userSchema);

export default UserModel;
