import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import approvalWorkflowController from "../controllers/approval-workflow.controller.js";

class ApprovalWorkflowRoutes implements Routes {
  public path = "/api/approvals";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get("/", approvalWorkflowController.list);
    this.router.post("/", approvalWorkflowController.create);
    this.router.patch("/:id/decision", approvalWorkflowController.decide);
  }
}

export default ApprovalWorkflowRoutes;
