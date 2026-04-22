import type { INoteDocument } from "../models/note.model.js";
import NoteModel from "../models/note.model.js";
import { andRefMatches, buildRefMatch } from "../utils/mongo-ref.js";

export interface CreateNotePayload {
  entityType?: "project" | "epic";
  parentType: "project" | "epic" | "task" | "subtask";
  parentId: string;
  projectId?: string | null;
  epicId?: string | null;
  title: string;
  content: string;
}

export interface UpdateNotePayload {
  title?: string;
  content?: string;
}

export const createNote = async (
  payload: CreateNotePayload,
): Promise<INoteDocument> => NoteModel.create(payload);

export const getNotesByParent = async (
  parentType: CreateNotePayload["parentType"],
  parentId: string,
): Promise<INoteDocument[]> =>
  NoteModel.find(
    andRefMatches(
      { parentType },
      {
        $expr: {
          $eq: [{ $toString: "$parentId" }, parentId],
        },
      },
    ),
  )
    .sort({ updatedAt: -1, _id: -1 })
    .exec();

export const getNotesByProject = async (
  projectId: string,
): Promise<INoteDocument[]> =>
  NoteModel.find({
    $or: [
      andRefMatches(
        { parentType: "project" },
        {
          $expr: {
            $eq: [{ $toString: "$parentId" }, projectId],
          },
        },
      ),
      andRefMatches(
        { entityType: "project" },
        buildRefMatch("projectId", projectId),
      ),
    ],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .exec();

export const getNotesByEpic = async (
  projectId: string,
  epicId: string,
): Promise<INoteDocument[]> =>
  NoteModel.find({
    $or: [
      andRefMatches(
        { parentType: "epic" },
        buildRefMatch("projectId", projectId),
        {
          $expr: {
            $eq: [{ $toString: "$parentId" }, epicId],
          },
        },
      ),
      andRefMatches(
        { entityType: "epic" },
        buildRefMatch("projectId", projectId),
        buildRefMatch("epicId", epicId),
      ),
    ],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .exec();

export const getNoteById = async (
  noteId: string,
): Promise<INoteDocument | null> => NoteModel.findById(noteId).exec();

export const updateNote = async (
  noteId: string,
  updates: UpdateNotePayload,
): Promise<INoteDocument | null> =>
  NoteModel.findByIdAndUpdate(noteId, updates, { new: true }).exec();

export const deleteNote = async (
  noteId: string,
): Promise<INoteDocument | null> => NoteModel.findByIdAndDelete(noteId).exec();

export const deleteNotesByProject = async (
  projectId: string,
): Promise<void> => {
  await NoteModel.deleteMany(buildRefMatch("projectId", projectId)).exec();
};

export const deleteNotesByEpic = async (epicId: string): Promise<void> => {
  await NoteModel.deleteMany(buildRefMatch("epicId", epicId)).exec();
};
