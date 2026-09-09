import { Schema, model, type Document } from "mongoose";

export interface ISdkNonce {
  nonce: string;
  expiresAt: Date;
}

export interface ISdkNonceDocument extends ISdkNonce, Document {}

const sdkNonceSchema = new Schema<ISdkNonceDocument>(
  {
    nonce: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
  },
);

// TTL index to automatically purge expired nonces from MongoDB
sdkNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SdkNonceModel = model<ISdkNonceDocument>("SdkNonce", sdkNonceSchema);

export default SdkNonceModel;
