import mongoose, { Types } from "mongoose";

import { connectDatabase } from "../../config/db.config.js";
import env from "../../config/env.js";
import NoteModel from "../../models/note.model.js";

const toStoredParentId = (value: unknown): unknown => {
  if (typeof value === "string" && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }

  return value;
};

const main = async (): Promise<void> => {
  void env;
  await connectDatabase();

  const notes = await NoteModel.find({
    $or: [{ parentType: { $exists: false } }, { parentId: { $exists: false } }],
  })
    .select({ _id: 1, entityType: 1, projectId: 1, epicId: 1 })
    .lean()
    .exec();

  let updated = 0;

  for (const note of notes) {
    const nextParentType =
      note.entityType === "epic" && note.epicId != null ? "epic" : "project";
    const nextParentId =
      nextParentType === "epic" ? note.epicId : note.projectId;

    if (nextParentId == null) {
      continue;
    }

    await NoteModel.updateOne(
      { _id: note._id },
      {
        $set: {
          parentType: nextParentType,
          parentId: toStoredParentId(nextParentId),
        },
      },
    ).exec();
    updated += 1;
  }

  console.info(`Polymorphic note backfill complete. Updated ${updated} notes.`);
  await mongoose.disconnect();
};

void main();
