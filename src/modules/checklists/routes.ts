import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import checklistController from "./controller.js";
import { requireChecklistAdmin } from "./permissions.js";

class ChecklistRoutes implements Routes {
  public path = "/api/checklists";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(requireChecklistAdmin);
    this.router.get("/", checklistController.listChecklists);
    this.router.post("/", checklistController.createChecklist);
    this.router.get("/:checklistId", checklistController.getChecklist);
    this.router.patch("/:checklistId", checklistController.updateChecklist);
    this.router.delete("/:checklistId", checklistController.deleteChecklist);
    this.router.post("/events/apply", checklistController.applyEvent);
  }
}

export default ChecklistRoutes;
