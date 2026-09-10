import type { Request, Response } from "express";
import invitationService from "../services/invitation.service.js";
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

class InvitationController {
  public inviteUser = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.projectId);
      const invitation = await invitationService.inviteUser(
        user._id.toString(),
        projectId,
        req.body as { email: string; role?: "ADMIN" | "MEMBER" },
      );

      res.status(201).json({
        message: "Member successfully added or invited to the project",
        data: { email: invitation.email, status: invitation.status },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public verifyInvitationToken = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: "Token is required" });
        return;
      }

      const invitationDetails =
        await invitationService.verifyInvitationToken(token);
      res.status(200).json({
        message: "Invitation token verified successfully",
        data: invitationDetails,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public acceptInvitation = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { token } = req.body as { token?: string };
      if (!token) {
        res.status(400).json({ error: "Token is required" });
        return;
      }

      const result = await invitationService.acceptInvitation(
        user._id.toString(),
        token,
      );

      res.status(200).json({
        message: "Invitation accepted successfully",
        data: result,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public rejectInvitation = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { token } = req.body as { token?: string };
      if (!token) {
        res.status(400).json({ error: "Token is required" });
        return;
      }

      const result = await invitationService.rejectInvitation(
        user._id.toString(),
        token,
      );

      res.status(200).json({
        message: "Invitation rejected",
        data: result,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /** Public endpoint — reject via email link without auth */
  public rejectInvitationByToken = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: "Token is required" });
        return;
      }

      await invitationService.rejectInvitationPublic(token);
      res.status(200).json({ message: "Invitation rejected" });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public revokeInvitation = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const invitationId = getRouteParam(req.params.invitationId);
      await invitationService.revokeInvitation(
        user._id.toString(),
        invitationId,
      );

      res.status(200).json({ message: "Invitation revoked" });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getProjectInvitations = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.projectId);
      const invitations = await invitationService.getProjectPendingInvitations(
        user._id.toString(),
        projectId,
      );

      res.status(200).json({ data: invitations });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getMyInvitations = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const invitations = await invitationService.getMyPendingInvitations(
        user.email,
      );
      res.status(200).json({ data: invitations });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new InvitationController();
