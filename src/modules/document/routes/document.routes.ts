import { Router } from "express";
import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import {
  getProjectDocuments,
  createDocument,
  getDocumentById,
  updateDocument,
  deleteDocument,
} from "../../../modules/document/controllers/document.controller.js";

class DocumentRoutes implements Routes {
  public path = "/documents";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(
      `/projects/:id/documents`,
      authMiddleware,
      getProjectDocuments,
    );
    this.router.post(`/projects/:id/documents`, authMiddleware, createDocument);
    this.router.get(`${this.path}/:docId`, authMiddleware, getDocumentById);
    this.router.patch(`${this.path}/:docId`, authMiddleware, updateDocument);
    this.router.delete(`${this.path}/:docId`, authMiddleware, deleteDocument);
  }
}

export default DocumentRoutes;
