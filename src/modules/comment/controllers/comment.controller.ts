import { Request, Response } from "express";
import commentService from "../services/comment.service.js";
import type { IUserDocument } from "../../auth/models/user.model.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

const getRouteParam = (value: string | string[] | undefined): string => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return "";
};

class CommentController {
  public addComment = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const taskId = getRouteParam(req.params.taskId);
      const { content } = req.body;
      const comment = await commentService.addComment(
        taskId,
        user._id.toString(),
        content,
      );

      res.status(201).json({
        message: "Comment added",
        data: { comment },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getComments = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const taskId = getRouteParam(req.params.taskId);
      const comments = await commentService.getComments(taskId);

      res.status(200).json({
        message: "Comments fetched",
        data: { comments },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new CommentController();
