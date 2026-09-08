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
import ActivityHistoryRoutes from "./routes/activity-log.routes.js";
import CommentRoutes from "./routes/comment.routes.js";
import AnalyticsRoutes from "./routes/analytics.routes.js";
import SlaRoutes from "./routes/sla.routes.js";
import ApprovalWorkflowRoutes from "./routes/approval-workflow.routes.js";
import PriorityEngineRoutes from "./routes/priority-engine.routes.js";
import ChecklistRoutes from "./modules/checklists/routes.js";
import EngagementRoutes from "./modules/engagement/routes.js";
import GuideAnalyticsRoutes from "./modules/guide-analytics/routes.js";
import GuideRoutes from "./modules/guides/routes.js";
import SurveyRoutes from "./modules/surveys/routes.js";
import TargetingRoutes from "./modules/targeting/routes.js";
import AiPlanningRoutes from "./routes/ai-planning.routes.js";
import SdkIntegrationRoutes from "./modules/sdk-integrations/routes.js";
import InvitationRoutes from "./routes/invitation.routes.js";
import WorkspaceRoutes from "./routes/workspace.routes.js";
import CentralizedAiRoutes from "./routes/ai.routes.js";
import DocumentRoutes from "./routes/document.routes.js";
import logger from "./lib/logger.js";

const server = new App([
  new DocumentRoutes(),
  new CentralizedAiRoutes(),
  new WorkspaceRoutes(),
  new GuideRoutes(),
  new SurveyRoutes(),
  new ChecklistRoutes(),
  new TargetingRoutes(),
  new EngagementRoutes(),
  new GuideAnalyticsRoutes(),
  new SdkIntegrationRoutes(),
  new AnalyticsRoutes(),
  new SlaRoutes(),
  new ApprovalWorkflowRoutes(),
  new PriorityEngineRoutes(),
  new HealthRoutes(),
  new AuthRoutes(),
  new TaskRoutes(),
  new ProjectRoutes(),
  new UserRoutes(),
  new EpicRoutes(),
  new NoteRoutes(),
  new SyncRoutes(),
  new ChatRoutes(),
  new AiPlanningRoutes(),
  new ActivityHistoryRoutes(),
  new CommentRoutes(),
  new InvitationRoutes(),
]);

process.on("uncaughtException", (error) => {
  logger.error("FATAL: Uncaught Exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error(
    "FATAL: Unhandled Rejection",
    reason instanceof Error ? reason : new Error(String(reason)),
  );
});

void server.listen().catch((error) => {
  logger.error(
    "Backend process exiting because startup failed",
    error instanceof Error ? error : new Error("Unknown error"),
  );
  process.exit(1);
});
