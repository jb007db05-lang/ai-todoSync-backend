import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "PORT",
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "FRONTEND_BASE_URL",
  "GPT_OAUTH_REDIRECT_URI",
  "BACKEND_URL",
];

let hasError = false;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    // If the key is not present in the env
    console.error(`❌ Missing required environment variable: ${key}`);
    hasError = true;
  }
}

if (hasError) {
  console.error("❌ Environment validation failed");
  process.exit(1);
}

process.stdout.write("✅ Environment variables validated" + "\n");
