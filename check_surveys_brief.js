import mongoose from "mongoose";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

const SurveySchema = new mongoose.Schema({}, { strict: false });
const Survey = mongoose.model("Survey", SurveySchema, "surveys");

async function check() {
  await mongoose.connect(MONGODB_URI);
  const surveys = await Survey.find({}).lean();
  console.log("Surveys found:", surveys.length);
  surveys.forEach(s => {
    console.log(`- Title: "${s.title}"`);
    console.log(`  ID: ${s._id}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  TenantId: ${s.tenantId}`);
    console.log(`  TargetingRules:`, JSON.stringify(s.targetingRules, null, 2));
  });
  await mongoose.disconnect();
}

check().catch(console.error);
