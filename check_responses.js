import mongoose from "mongoose";

const MONGODB_URI = "mongodb://localhost:27017/ai-todosync";

const SurveyResponseSchema = new mongoose.Schema({}, { strict: false });
const SurveyResponse = mongoose.model("SurveyResponse", SurveyResponseSchema, "surveyresponses");

async function checkResponses() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const responses = await SurveyResponse.find({}).lean();
  console.log("\n--- Survey Responses in DB ---");
  console.log(JSON.stringify(responses, null, 2));

  await mongoose.disconnect();
}

checkResponses().catch(console.error);
