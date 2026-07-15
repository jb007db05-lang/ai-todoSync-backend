import mongoose from "mongoose";

async function run() {
  for (const dbName of ["ai-todosync", "pristine"]) {
    const MONGODB_URI = `mongodb://localhost:27017/${dbName}`;
    await mongoose.connect(MONGODB_URI);
    console.log(`\n=================== DB: ${dbName} ===================`);

    const users = await mongoose.connection.db
      ?.collection("users")
      .find()
      .toArray();
    console.log("Users in DB:");
    for (const u of users || []) {
      if (u.email.includes("nairaditya") || u.email.includes("aditya")) {
        console.log(
          `- ID: ${u._id}, Email: ${u.email}, Role: ${u.role}, Tenant: ${u.tenantId || u.tenant || u.tenantId?.toString()}`,
        );
      }
    }

    await mongoose.disconnect();
  }
}

run().catch(console.error);
