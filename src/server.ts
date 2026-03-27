import App from './app.js';
import HealthRoutes from './routes/health.routes.js';
import AuthRoutes from './routes/auth.routes.js';
import TaskRoutes from './routes/tasks.routes.js';
import SyncRoutes from './routes/sync.routes.js';

const server = new App([
  new HealthRoutes(),
  new AuthRoutes(),
  new TaskRoutes(),
  new SyncRoutes()
]);

server.listen();
