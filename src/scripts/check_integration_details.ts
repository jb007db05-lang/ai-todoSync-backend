import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/ai-todosync";

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "pristine" });
  console.log("Connected to pristine database");

  const integration = await mongoose.connection.db
    ?.collection("sdkintegrations")
    .findOne({
      name: "Zaikara Local",
    });
  console.log(
    "Zaikara Local Integration details:",
    JSON.stringify(integration, null, 2),
  );

  await mongoose.disconnect();
}

run().catch(console.error);
