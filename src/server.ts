import App from "./app.js";
import HealthRoutes from "./routes/health.routes.js";
import AuthRoutes from "./routes/auth.routes.js";
import TaskRoutes from "./routes/tasks.routes.js";
import SyncRoutes from "./routes/sync.routes.js";
import ProjectRoutes from "./routes/project.routes.js";
import NoteRoutes from "./routes/note.routes.js";
import EpicRoutes from "./routes/epic.routes.js";
import UserRoutes from "./routes/users.routes.js";
import ChatRoutes from "./routes/chat.routes.js";
import logger from "./lib/logger.js";

const server = new App([
  new HealthRoutes(),
  new AuthRoutes(),
  new TaskRoutes(),
  new ProjectRoutes(),
  new UserRoutes(),
  new EpicRoutes(),
  new NoteRoutes(),
  new SyncRoutes(),
  new ChatRoutes(),
]);

void server.listen().catch((error) => {
  logger.error(
    "Backend process exiting because startup failed",
    error instanceof Error ? error : new Error("Unknown error"),
  );
  process.exit(1);
});
