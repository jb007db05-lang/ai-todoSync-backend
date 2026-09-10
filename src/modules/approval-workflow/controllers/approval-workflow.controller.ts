import type { Request, Response } from "express";

import type { IUserDocument } from "../../auth/models/user.model.js";
import approvalWorkflowService from "../services/approval-workflow.service.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

class ApprovalWorkflowController {
  public create = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const approval = await approvalWorkflowService.createApproval(
        user._id.toString(),
        req.body,
      );
      res
        .status(201)
        .json({ message: "Approval workflow created", data: { approval } });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public list = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId =
        typeof req.query.projectId === "string" ? req.query.projectId : "";
      const approvals = await approvalWorkflowService.listApprovals(
        user._id.toString(),
        projectId,
      );
      res.json({ message: "Approval workflows fetched", data: { approvals } });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public decide = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const approvalId = typeof req.params.id === "string" ? req.params.id : "";
      const approval = await approvalWorkflowService.decide(
        user._id.toString(),
        approvalId,
        req.body as { decision?: unknown; note?: unknown },
      );
      res.json({ message: "Approval workflow updated", data: { approval } });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new ApprovalWorkflowController();
