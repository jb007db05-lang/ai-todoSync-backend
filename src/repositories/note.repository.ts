import type { INoteDocument } from "../models/note.model.js";
import NoteModel from "../models/note.model.js";

export interface CreateNotePayload {
  entityType: "project" | "epic";
  projectId: string;
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

export const getNotesByProject = async (
  projectId: string,
): Promise<INoteDocument[]> =>
  NoteModel.find({ entityType: "project", projectId })
    .sort({ updatedAt: -1, _id: -1 })
    .exec();

export const getNotesByEpic = async (
  projectId: string,
  epicId: string,
): Promise<INoteDocument[]> =>
  NoteModel.find({ entityType: "epic", projectId, epicId })
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
  await NoteModel.deleteMany({ projectId }).exec();
};

export const deleteNotesByEpic = async (epicId: string): Promise<void> => {
  await NoteModel.deleteMany({ epicId }).exec();
};
