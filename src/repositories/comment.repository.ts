import CommentModel, { ICommentDocument } from "../models/comment.model.js";
import { buildRefMatch } from "../utils/mongo-ref.js";

export interface CreateCommentPayload {
  taskId: string;
  userId: string;
  content: string;
  mentions: string[];
}

export const commentPopulateOptions = [
  { path: "userId", select: "email name firstName lastName" },
  { path: "mentions", select: "email name firstName lastName" },
];

export const createComment = async (
  payload: CreateCommentPayload,
): Promise<ICommentDocument> =>
  CommentModel.create(payload).then((comment) =>
    comment.populate(commentPopulateOptions),
  );

export const getCommentsByTaskId = async (
  taskId: string,
): Promise<ICommentDocument[]> =>
  CommentModel.find(buildRefMatch("taskId", taskId))
    .populate(commentPopulateOptions)
    .sort({ createdAt: 1 })
    .exec();

export const deleteComment = async (commentId: string): Promise<void> => {
  await CommentModel.findByIdAndDelete(commentId).exec();
};
