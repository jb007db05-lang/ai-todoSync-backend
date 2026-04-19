import dotenv from "dotenv";

dotenv.config();

export interface EnvConfig {
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  MAX_COMPANION_DEVICES: number;
  ALLOWED_ORIGINS: string[];
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_BASE_URL: string;
  GPT_OAUTH_REDIRECT_URI: string;
  BACKEND_URL: string;
}

const {
  PORT = "4000",
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN = "30d",
  MAX_COMPANION_DEVICES = "5",
  ALLOWED_ORIGINS = "",
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  FRONTEND_BASE_URL,
  GPT_OAUTH_REDIRECT_URI,
  BACKEND_URL,
} = process.env;

if (!MONGODB_URI || !JWT_SECRET || !JWT_EXPIRES_IN) {
  throw new Error("Missing required environment variables for backend startup");
}

if (
  !GOOGLE_CLIENT_ID ||
  !GOOGLE_CLIENT_SECRET ||
  !GOOGLE_REDIRECT_URI ||
  !FRONTEND_BASE_URL ||
  !GPT_OAUTH_REDIRECT_URI ||
  !BACKEND_URL
) {
  throw new Error(
    "Missing required Google OAuth environment variables for backend startup",
  );
}

const env: EnvConfig = {
  PORT: Number(PORT),
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  MAX_COMPANION_DEVICES: Number(MAX_COMPANION_DEVICES),
  ALLOWED_ORIGINS: ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID.trim(),
  GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET.trim(),
  GOOGLE_REDIRECT_URI: GOOGLE_REDIRECT_URI.trim(),
  FRONTEND_BASE_URL: FRONTEND_BASE_URL.trim(),
  GPT_OAUTH_REDIRECT_URI: GPT_OAUTH_REDIRECT_URI.trim(),
  BACKEND_URL: BACKEND_URL.trim(),
};

console.log("All the envs : ",env)

export default env;
