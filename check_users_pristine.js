import mongoose from "mongoose";

async function run() {
  await mongoose.connect("mongodb://localhost:27017/pristine");
  const user = await mongoose.connection.db.collection("users").findOne({
    _id: new mongoose.Types.ObjectId("69e70c3d7c474f0f1337d982")
  });
  console.log("User in pristine db:", user);
  
  const allUsers = await mongoose.connection.db.collection("users").find({}).toArray();
  console.log("\nAll users in pristine db:");
  for (const u of allUsers) {
    console.log(`- _id: ${u._id}, email: ${u.email}`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
