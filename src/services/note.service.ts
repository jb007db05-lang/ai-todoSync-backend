import type { INoteDocument } from "../models/note.model.js";
import {
  createNote,
  deleteNote,
  getNoteById,
  getNotesByEpic,
  getNotesByProject,
  updateNote,
} from "../repositories/note.repository.js";
import type {
  CreateNotePayload as CreateNoteRepositoryPayload,
  UpdateNotePayload as UpdateNoteRepositoryPayload,
} from "../repositories/note.repository.js";
import projectService from "./project.service.js";
import epicService from "./epic.service.js";

interface NoteDto {
  id: string;
  entityType: "project" | "epic";
  projectId: string;
  epicId: string | null;
  title: string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface NotePayload {
  appendContent?: boolean;
  title?: string;
  content?: string;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class NoteService {
  public async createNote(
    userId: string,
    projectId: string,
    payload: NotePayload,
  ): Promise<NoteDto> {
    await projectService.assertProjectOwnership(userId, projectId);

    const createPayload: CreateNoteRepositoryPayload = {
      entityType: "project",
      projectId,
      epicId: null,
      title: this.normalizeTitle(payload.title),
      content: this.normalizeContent(payload.content),
    };

    // Issue #10: Unique note titles within project
    const projectNotes = await getNotesByProject(projectId);
    if (
      projectNotes.some(
        (n) => n.title.toLowerCase() === createPayload.title.toLowerCase(),
      )
    ) {
      throw new HttpError(
        409,
        `A note with the title "${createPayload.title}" already exists in this project`,
      );
    }

    const note = await createNote(createPayload);
    return this.toDto(note);
  }

  public async fetchProjectNotes(
    userId: string,
    projectId: string,
  ): Promise<NoteDto[]> {
    await projectService.assertProjectMembership(userId, projectId);
    const notes = await getNotesByProject(projectId);
    return notes.map((note) => this.toDto(note));
  }

  public async createEpicNote(
    userId: string,
    projectId: string,
    epicId: string,
    payload: NotePayload,
  ): Promise<NoteDto> {
    await projectService.assertProjectOwnership(userId, projectId);
    await epicService.assertEpicInProject(projectId, epicId);

    const createPayload: CreateNoteRepositoryPayload = {
      entityType: "epic",
      projectId,
      epicId,
      title: this.normalizeTitle(payload.title),
      content: this.normalizeContent(payload.content),
    };

    // Issue #10: Unique note titles within project
    const projectNotes = await getNotesByProject(projectId);
    if (
      projectNotes.some(
        (n) => n.title.toLowerCase() === createPayload.title.toLowerCase(),
      )
    ) {
      throw new HttpError(
        409,
        `A note with the title "${createPayload.title}" already exists in this project`,
      );
    }

    const note = await createNote(createPayload);
    return this.toDto(note);
  }

  public async fetchEpicNotes(
    userId: string,
    projectId: string,
    epicId: string,
  ): Promise<NoteDto[]> {
    await projectService.assertProjectMembership(userId, projectId);
    await epicService.assertEpicInProject(projectId, epicId);
    const notes = await getNotesByEpic(projectId, epicId);
    return notes.map((note) => this.toDto(note));
  }

  public async fetchNote(userId: string, noteId: string): Promise<NoteDto> {
    const note = await this.getAccessibleNote(userId, noteId);
    return this.toDto(note);
  }

  public async updateNote(
    userId: string,
    noteId: string,
    payload: NotePayload,
  ): Promise<NoteDto> {
    const existingNote = await this.getAccessibleNote(userId, noteId, true);
    const updates: UpdateNoteRepositoryPayload = {};
    const appendContent = payload.appendContent === true;

    if (Object.prototype.hasOwnProperty.call(payload, "title")) {
      const newTitle = this.normalizeTitle(payload.title);

      // Issue #10: Check for unique title if it changed
      if (newTitle.toLowerCase() !== existingNote.title.toLowerCase()) {
        const projectNotes = await getNotesByProject(
          existingNote.projectId.toString(),
        );
        if (
          projectNotes.some(
            (n) => n.title.toLowerCase() === newTitle.toLowerCase(),
          )
        ) {
          throw new HttpError(
            409,
            `A note with the title "${newTitle}" already exists in this project`,
          );
        }
      }
      updates.title = newTitle;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "content")) {
      const normalizedContent = this.normalizeContent(payload.content);
      updates.content = appendContent
        ? this.appendContent(existingNote.content, normalizedContent)
        : normalizedContent;
    }

    // Issue #9: Repository already uses $set internally for findByIdAndUpdate,
    // ensuring fields like title/content are only updated if present in 'updates'.
    const updatedNote = await updateNote(existingNote._id.toString(), updates);

    if (updatedNote == null) {
      throw new HttpError(404, "Note not found");
    }

    return this.toDto(updatedNote);
  }

  public async deleteNote(userId: string, noteId: string): Promise<string> {
    const note = await this.getAccessibleNote(userId, noteId, true);
    const deleted = await deleteNote(note._id.toString());

    if (deleted == null) {
      throw new HttpError(404, "Note not found");
    }

    return deleted._id.toString();
  }

  private async getAccessibleNote(
    userId: string,
    noteId: string,
    requireAdmin = false,
  ): Promise<INoteDocument> {
    const note = await getNoteById(noteId);

    if (note == null) {
      throw new HttpError(404, "Note not found");
    }

    if (requireAdmin) {
      await projectService.assertProjectOwnership(
        userId,
        note.projectId.toString(),
      );
    } else {
      await projectService.assertProjectMembership(
        userId,
        note.projectId.toString(),
      );
    }
    return note;
  }

  private toDto(note: INoteDocument): NoteDto {
    return {
      id: note._id.toString(),
      entityType: note.entityType,
      projectId: note.projectId.toString(),
      epicId: note.epicId?.toString() ?? null,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  private normalizeTitle(value: unknown): string {
    const title = typeof value === "string" ? value.trim() : "";

    if (!title) {
      throw new HttpError(400, "Note title is required");
    }

    return title;
  }

  // Issue #11: Reject whitespace-only content
  private normalizeContent(value: unknown): string {
    if (value === undefined) {
      return "";
    }

    if (typeof value !== "string") {
      throw new HttpError(400, "Note content must be a string");
    }

    const trimmed = value.replace(/<[^>]*>/g, "").trim();
    if (value.length > 0 && trimmed.length === 0) {
      throw new HttpError(
        400,
        "Note content cannot be empty or whitespace only",
      );
    }

    return value;
  }

  private appendContent(
    existingContent: string,
    incomingContent: string,
  ): string {
    if (!incomingContent.trim()) {
      return existingContent;
    }

    if (!existingContent.trim()) {
      return incomingContent;
    }

    return `${existingContent}<p><br></p>${incomingContent}`;
  }
}

const noteService = new NoteService();

export type { NoteDto, NotePayload };
export default noteService;
