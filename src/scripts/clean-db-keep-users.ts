import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/pristine";

function slugify(text: string): string {
  return (
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

async function run() {
  console.log("Connecting to MongoDB:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI, { dbName: "pristine" });
  const db = mongoose.connection.db;
  if (!db) throw new Error("Could not connect to database");

  const collections = await db.listCollections().toArray();
  console.log(
    `Found ${collections.length} collections in database 'pristine'.`,
  );

  for (const col of collections) {
    const colName = col.name;
    if (colName === "users" || colName.startsWith("system.")) {
      console.log(`[PRESERVED] Skipping '${colName}'`);
      continue;
    }

    const countBefore = await db.collection(colName).countDocuments();
    const result = await db.collection(colName).deleteMany({});
    console.log(
      `[CLEARED] '${colName}': deleted ${result.deletedCount} (was ${countBefore})`,
    );
  }

  // Verify users
  const userCount = await db.collection("users").countDocuments();
  console.log(`\nVerified users count: ${userCount}`);

  // Create exactly ONE default workspace for each user
  const users = await db.collection("users").find().toArray();
  for (const user of users) {
    const userName = user.name || "Personal";
    const wsName = `${userName}'s Workspace`;
    const baseSlug = slugify(wsName);

    const ws = await db.collection("workspaces").insertOne({
      name: wsName,
      slug: `${baseSlug}-${String(user._id).slice(-4)}`,
      ownerId: user._id,
      settings: {
        defaultProjectRole: "MEMBER",
        allowGuestInvites: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection("workspacemembers").insertOne({
      workspaceId: ws.insertedId,
      userId: user._id,
      role: "OWNER",
      permissions: {},
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(
      `[INITIALIZED] Workspace for user ${user.email} (${user._id}): ${wsName}`,
    );
  }

  console.log(
    "\nDatabase cleanup complete. All tables other than 'users' have been wiped clean, and 1 clean workspace created per user.",
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
