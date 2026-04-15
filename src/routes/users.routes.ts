import { Router } from "express";

import userController from "../controllers/user.controller.js";
import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";

class UserRoutes implements Routes {
  public path = "/api/users";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get("/search", userController.searchUsers);
  }
}

export default UserRoutes;
