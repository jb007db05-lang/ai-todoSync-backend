import crypto from "crypto";
import env from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getCipherKey = (): Buffer => {
  const secret =
    env.ENCRYPTION_KEY || "default_fallback_encryption_key_32bytes";
  // Always produce an exact 32-byte key buffer for AES-256-GCM
  return crypto.createHash("sha256").update(secret).digest();
};

export const isEncrypted = (text: string): boolean => {
  if (!text || typeof text !== "string") return false;
  const parts = text.split(":");
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
};

/**
 * Reversibly encrypts a string (e.g. API Key) for secure storage.
 */
export const encrypt = (text: string): string => {
  if (!text) return text;
  if (isEncrypted(text)) return text; // Prevent double encryption

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getCipherKey(), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

/**
 * Decrypts a string that was encrypted with the encrypt function.
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText || typeof encryptedText !== "string") return encryptedText;
  if (!isEncrypted(encryptedText)) return encryptedText; // Unencrypted string

  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, getCipherKey(), iv);

    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (_error) {
    return encryptedText;
  }
};

/**
 * Creates a deterministic HMAC hash for indexed lookups.
 * Safe for lookups because the same key always produces the same hash.
 */
export const deterministicHash = (text: string): string => {
  if (!text) return "";
  return crypto.createHmac("sha256", getCipherKey()).update(text).digest("hex");
};
