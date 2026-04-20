import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Generates a secure, random API key.
 * Format: ak_ followed by 32 hex characters.
 */
export const generateApiKey = (): string => {
  return `ak_${randomBytes(16).toString("hex")}`;
};

/**
 * Hashes a raw API key for secure storage.
 */
export const hashApiKey = async (apiKey: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(apiKey, salt);
};

/**
 * Verifies a raw API key against a hashed key.
 */
export const verifyApiKey = async (apiKey: string, hashedKey: string): Promise<boolean> => {
  return bcrypt.compare(apiKey, hashedKey);
};
