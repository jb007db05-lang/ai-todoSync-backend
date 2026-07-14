import { Router } from "express";
import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import invitationController from "../controllers/invitation.controller.js";

class InvitationRoutes implements Routes {
  public path = "/api/invitations";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Public routes (no auth required)
    this.router.get("/verify", invitationController.verifyInvitationToken);
    this.router.get(
      "/reject-public",
      invitationController.rejectInvitationByToken,
    );

    // Private routes (Auth required)
    this.router.get(
      "/me",
      authMiddleware,
      invitationController.getMyInvitations,
    );
    this.router.post(
      "/projects/:projectId",
      authMiddleware,
      invitationController.inviteUser,
    );
    this.router.get(
      "/projects/:projectId",
      authMiddleware,
      invitationController.getProjectInvitations,
    );
    this.router.post(
      "/accept",
      authMiddleware,
      invitationController.acceptInvitation,
    );
    this.router.post(
      "/reject",
      authMiddleware,
      invitationController.rejectInvitation,
    );
    this.router.delete(
      "/:invitationId",
      authMiddleware,
      invitationController.revokeInvitation,
    );
  }
}

export default InvitationRoutes;
