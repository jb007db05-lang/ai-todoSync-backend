import TaskModel, {
  type ITaskDocument,
  type TaskPriority,
} from "../../../modules/task/models/task.model.js";
import { getProjectMembershipsByUser } from "../../project/repositories/project-member.repository.js";
import { getTaskByIdAndUser } from "../repositories/task.repository.js";
import { buildRefInMatch, buildRefMatch } from "../../../utils/mongo-ref.js";
import activityLogService from "../../audit/services/activity-log.service.js";

interface PriorityEvaluation {
  taskId: string;
  basePriority: TaskPriority;
  dynamicPriority: TaskPriority;
  urgencyScore: number;
  impactScore: number;
  dependencyWeight: number;
  dynamicPriorityScore: number;
  downstreamTaskCount: number;
  reason: string;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class PriorityEngineService {
  public async evaluateTaskForUser(
    taskId: string,
    userId: string,
  ): Promise<PriorityEvaluation> {
    const memberships = await getProjectMembershipsByUser(userId);
    const task = await getTaskByIdAndUser(
      taskId,
      userId,
      memberships.map((membership) => membership.projectId.toString()),
    );

    if (!task) {
      throw new HttpError(404, "Task not found");
    }

    return this.evaluateAndPersist(task, userId);
  }

  public async recalculateForUser(
    userId: string,
  ): Promise<PriorityEvaluation[]> {
    const memberships = await getProjectMembershipsByUser(userId);
    const projectIds = memberships.map((membership) =>
      membership.projectId.toString(),
    );
    const tasks = await TaskModel.find({
      status: { $nin: ["DONE", "rolled_over"] },
      $or: [
        buildRefMatch("userId", userId),
        buildRefInMatch("projectId", projectIds),
      ],
    }).exec();

    const results: PriorityEvaluation[] = [];
    for (const task of tasks) {
      results.push(await this.evaluateAndPersist(task, userId));
    }

    return results;
  }

  public async recalculateAllOpenTasks(): Promise<number> {
    const tasks = await TaskModel.find({
      status: { $nin: ["DONE", "rolled_over"] },
    }).exec();

    for (const task of tasks) {
      await this.evaluateAndPersist(task, task.userId.toString());
    }

    return tasks.length;
  }

  public async evaluateAndPersist(
    task: ITaskDocument,
    actorUserId: string,
  ): Promise<PriorityEvaluation> {
    const downstreamTaskCount = await this.countDownstreamTasks(
      task._id.toString(),
    );
    const urgencyScore = this.calculateUrgencyScore(task);
    const impactScore = this.calculateImpactScore(task, downstreamTaskCount);
    const dependencyWeight = downstreamTaskCount;
    const dynamicPriorityScore = Math.min(
      100,
      Math.round(
        urgencyScore * 0.45 +
          impactScore * 0.35 +
          Math.min(100, dependencyWeight * 7) * 0.2,
      ),
    );
    const basePriority = task.basePriority ?? task.priority ?? "MEDIUM";
    const scorePriority = this.priorityFromScore(dynamicPriorityScore);
    const dependencyPriority =
      task.status === "BLOCKED" && downstreamTaskCount >= 14
        ? "CRITICAL"
        : scorePriority;
    const dynamicPriority = this.maxPriority(basePriority, dependencyPriority);
    const reason = this.reasonFor(
      task,
      dynamicPriority,
      downstreamTaskCount,
      dynamicPriorityScore,
    );
    const previousPriority = task.priority;

    task.basePriority = basePriority;
    task.dynamicPriority = dynamicPriority;
    task.urgencyScore = urgencyScore;
    task.impactScore = impactScore;
    task.dependencyWeight = dependencyWeight;
    task.dynamicPriorityScore = dynamicPriorityScore;

    if (this.priorityRank(dynamicPriority) > this.priorityRank(task.priority)) {
      task.priority = dynamicPriority;
      task.priorityEscalatedAt = new Date();
      task.priorityEscalationReason = reason;
    }

    await task.save();

    if (previousPriority !== task.priority && task.projectId) {
      await activityLogService.logActivity({
        projectId: task.projectId.toString(),
        entityType: "task",
        entityId: task._id.toString(),
        entityName: task.title,
        action: "escalated",
        userId: actorUserId,
        userName: "System",
        description: `auto-escalated task priority from ${previousPriority} to ${task.priority}`,
        metadata: {
          previousPriority,
          nextPriority: task.priority,
          urgencyScore,
          impactScore,
          dependencyWeight,
          downstreamTaskCount,
          dynamicPriorityScore,
          reason,
        },
      });
    }

    return {
      taskId: task._id.toString(),
      basePriority,
      dynamicPriority,
      urgencyScore,
      impactScore,
      dependencyWeight,
      dynamicPriorityScore,
      downstreamTaskCount,
      reason,
    };
  }

  private async countDownstreamTasks(
    taskId: string,
    depth = 0,
  ): Promise<number> {
    if (depth >= 3) {
      return 0;
    }

    const direct = await TaskModel.find({
      ...buildRefMatch("blockedByTaskId", taskId),
      status: { $nin: ["DONE", "rolled_over"] },
    })
      .select("_id")
      .exec();

    let total = direct.length;
    for (const task of direct) {
      total += await this.countDownstreamTasks(task._id.toString(), depth + 1);
    }

    return total;
  }

  private calculateUrgencyScore(task: ITaskDocument): number {
    if (task.responseBreached || task.resolutionBreached) {
      return 100;
    }

    const dueAt = task.slaResolutionDueAt ?? task.slaResponseDueAt;
    if (!dueAt) {
      return task.status === "BLOCKED" ? 55 : 25;
    }

    const now = Date.now();
    const createdAt = task.createdAt?.getTime() ?? now;
    const totalMs = Math.max(1, dueAt.getTime() - createdAt);
    const remainingRatio = (dueAt.getTime() - now) / totalMs;
    const score = Math.round(
      (1 - Math.max(0, Math.min(1, remainingRatio))) * 100,
    );

    return Math.min(100, Math.max(task.status === "BLOCKED" ? 55 : 0, score));
  }

  private calculateImpactScore(
    task: ITaskDocument,
    downstreamTaskCount: number,
  ): number {
    const subtaskImpact = Math.min(25, (task.subtasks?.length ?? 0) * 5);
    const dependencyImpact = Math.min(75, downstreamTaskCount * 7);
    const blockedBoost = task.status === "BLOCKED" ? 15 : 0;

    return Math.min(100, subtaskImpact + dependencyImpact + blockedBoost);
  }

  private priorityFromScore(score: number): TaskPriority {
    if (score >= 80) return "CRITICAL";
    if (score >= 60) return "HIGH";
    if (score >= 35) return "MEDIUM";
    return "LOW";
  }

  private maxPriority(left: TaskPriority, right: TaskPriority): TaskPriority {
    return this.priorityRank(left) >= this.priorityRank(right) ? left : right;
  }

  private priorityRank(priority: TaskPriority): number {
    return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[priority];
  }

  private reasonFor(
    task: ITaskDocument,
    priority: TaskPriority,
    downstreamTaskCount: number,
    score: number,
  ): string {
    if (task.status === "BLOCKED" && downstreamTaskCount >= 14) {
      return `Blocked task affects ${downstreamTaskCount} downstream tasks`;
    }

    return `Dynamic priority ${priority} from score ${score} with ${downstreamTaskCount} downstream tasks`;
  }
}

export default new PriorityEngineService();
