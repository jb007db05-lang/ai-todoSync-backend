import {
  createComment,
  getCommentsByTaskId,
} from "../repositories/comment.repository.js";
import UserModel from "../models/user.model.js";
import type { ICommentDocument } from "../models/comment.model.js";

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class CommentService {
  public async addComment(
    taskId: string,
    userId: string,
    content: string,
  ): Promise<ICommentDocument> {
    if (!content || content.trim() === "") {
      throw new HttpError(400, "Comment content is required");
    }

    const mentions = await this.parseMentions(content);

    return createComment({
      taskId,
      userId,
      content,
      mentions,
    });
  }

  public async getComments(taskId: string): Promise<ICommentDocument[]> {
    return getCommentsByTaskId(taskId);
  }

  private async parseMentions(content: string): Promise<string[]> {
    const mentionRegex = /@(\S+)/g;
    const matches = Array.from(content.matchAll(mentionRegex));
    const mentions: string[] = [];

    for (const match of matches) {
      const handle = match[1];
      // Try to find user by email or name
      const user = await UserModel.findOne({
        $or: [
          { email: handle.toLowerCase() },
          { name: new RegExp(`^${handle}$`, "i") },
          { firstName: new RegExp(`^${handle}$`, "i") },
        ],
      })
        .select("_id")
        .exec();

      if (user) {
        mentions.push(user._id.toString());
      }
    }

    return Array.from(new Set(mentions));
  }
}

const commentService = new CommentService();
export default commentService;
