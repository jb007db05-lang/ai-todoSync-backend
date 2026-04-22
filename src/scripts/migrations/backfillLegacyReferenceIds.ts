import mongoose, { Model, Types } from "mongoose";
import env from "../../config/env.js";
import { connectDatabase } from "../../config/db.config.js";
import CommentModel from "../../models/comment.model.js";
import EpicModel from "../../models/epic.model.js";
import NoteModel from "../../models/note.model.js";
import ProjectMemberModel from "../../models/project-member.model.js";
import TaskModel from "../../models/task.model.js";

const convertField = async (
  model: Model<any>,
  field: string,
): Promise<number> => {
  const docs = await model
    .find({
      [field]: { $type: "string" },
    })
    .select({ _id: 1, [field]: 1 })
    .lean()
    .exec();

  let updated = 0;

  for (const doc of docs) {
    const value = doc[field];
    if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
      continue;
    }

    await model
      .updateOne(
        { _id: doc._id },
        { $set: { [field]: new Types.ObjectId(value) } },
      )
      .exec();
    updated += 1;
  }

  return updated;
};

const main = async () => {
  void env;
  await connectDatabase();

  const results = await Promise.all([
    convertField(CommentModel, "taskId"),
    convertField(CommentModel, "userId"),
    convertField(EpicModel, "projectId"),
    convertField(NoteModel, "projectId"),
    convertField(NoteModel, "epicId"),
    convertField(ProjectMemberModel, "projectId"),
    convertField(ProjectMemberModel, "userId"),
    convertField(TaskModel, "userId"),
    convertField(TaskModel, "blockedByTaskId"),
    convertField(TaskModel, "projectId"),
    convertField(TaskModel, "epicId"),
    convertField(TaskModel, "assignedTo"),
    convertField(TaskModel, "assignedBy"),
  ]);

  const totalUpdated = results.reduce((sum, value) => sum + value, 0);
  console.info(
    `Legacy reference migration complete. Updated ${totalUpdated} fields.`,
  );
  await mongoose.disconnect();
};

void main();
