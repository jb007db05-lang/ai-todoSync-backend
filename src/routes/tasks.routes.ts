import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import taskController from "../controllers/task.controller.js";

class TaskRoutes implements Routes {
  public path = "/api/tasks";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get("/", taskController.getTasks);
    this.router.get("/assigned", taskController.getTasksAssignedToMe);
    this.router.get("/summary", taskController.taskSummary);
    this.router.post("/", taskController.createTask);
    this.router.patch("/:id/status", taskController.updateTaskStatus);
    this.router.patch("/:id/block", taskController.markTaskBlocked);
    this.router.patch("/:id/unblock", taskController.unblockTask);
    this.router.patch("/:id/assign", taskController.assignTask);
    this.router.patch("/:id/reassign", taskController.reassignTask);
    this.router.post("/bulk-assign", taskController.bulkAssignTasks);
    this.router.patch("/:id", taskController.updateTask);
    this.router.delete("/:id", taskController.deleteTask);
  }
}

export default TaskRoutes;
