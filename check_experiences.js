import mongoose from "mongoose";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

const SurveySchema = new mongoose.Schema({}, { strict: false });
const Survey = mongoose.model("Survey", SurveySchema, "surveys");

const GuideSchema = new mongoose.Schema({}, { strict: false });
const Guide = mongoose.model("Guide", GuideSchema, "guides");

async function checkExperiences() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const surveys = await Survey.find({}).lean();
  console.log("\n--- Surveys in DB ---");
  console.log(JSON.stringify(surveys, null, 2));

  const guides = await Guide.find({}).lean();
  console.log("\n--- Guides in DB ---");
  console.log(JSON.stringify(guides, null, 2));

  await mongoose.disconnect();
}

checkExperiences().catch(console.error);
