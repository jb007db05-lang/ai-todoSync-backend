import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IUser {
  email: string;
  password: string | null;
  syncApiKey: string;
  authProvider: 'local' | 'google';
  googleId?: string | null;
  name?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document {
  comparePassword(candidate: string): Promise<boolean>;
  regenerateSyncApiKey(): string;
}

const generateSyncApiKey = () => randomBytes(32).toString('hex');

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      default: null
    },
    syncApiKey: {
      type: String,
      required: true,
      default: generateSyncApiKey
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      required: true,
      default: 'local'
    },
    googleId: {
      type: String,
      default: null
    },
    name: {
      type: String,
      trim: true,
      default: null
    }
  },
  { timestamps: true }
);

userSchema.pre<IUserDocument>('save', async function () {
  if (!this.isModified('password') || this.password == null) {
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

const UserModel = model<IUserDocument>('User', userSchema);

export default UserModel;
