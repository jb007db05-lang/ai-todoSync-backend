import crypto from "crypto";
import env from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Reversibly encrypts a string (e.g. API Key) for secure storage.
 */
export const encrypt = (text: string): string => {
  if (!text) return text;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(env.ENCRYPTION_KEY, "hex"),
    iv,
  );

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

/**
 * Decrypts a string that was encrypted with the encrypt function.
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;

  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(env.ENCRYPTION_KEY, "hex"),
    iv,
  );

  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

/**
 * Creates a deterministic HMAC hash for indexed lookups.
 * Safe for lookups because the same key always produces the same hash.
 */
export const deterministicHash = (text: string): string => {
  if (!text) return "";
  return crypto
    .createHmac("sha256", env.ENCRYPTION_KEY)
    .update(text)
    .digest("hex");
};
