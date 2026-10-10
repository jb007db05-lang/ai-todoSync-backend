import mongoose from "mongoose";
import TaskModel from "../../task/models/task.model.js";
import ProjectModel from "../../project/models/project.model.js";
import TimeEntryModel from "../../time-tracking/time-entry.model.js";
import PromptLibraryModel from "../../prompt/models/prompt-library.model.js";
import UserModel from "../../auth/models/user.model.js";
import accessService, {
  type WorkspaceAccess,
} from "../../access/access.service.js";
import { AppError } from "../../../utils/app-error.js";

/**
 * The Insights page in one call: how work is going (tasks), where time goes
 * (hours) and which prompts are used, for the projects the member can open in
 * the active workspace. Plain numbers plus a short "needs attention" list.
 */

export const INSIGHT_RANGES = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
  all_time: null,
} as const;
export type InsightRange = keyof typeof INSIGHT_RANGES;

const DAY = 86_400_000;
const STALE_DAYS = 14;
const { ObjectId } = mongoose.Types;

const today = () => new Date().toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 10) / 10;

export interface AttentionItem {
  kind: "overdue" | "blocked" | "stale" | "unassigned";
  projectId: string;
  projectName: string;
  count: number;
  message: string;
}

class InsightsService {
  public async overview(
    access: WorkspaceAccess,
    options: { timeRange?: string; projectId?: string },
  ) {
    const range = (
      options.timeRange && options.timeRange in INSIGHT_RANGES
        ? options.timeRange
        : "last_30_days"
    ) as InsightRange;
    const days = INSIGHT_RANGES[range];
    const since = days ? new Date(Date.now() - days * DAY) : null;

    let projectIds = await accessService.accessibleProjectIds(access);
    if (options.projectId) {
      if (!projectIds.includes(options.projectId)) {
        throw new AppError(404, "Project not found", "NOT_FOUND");
      }
      projectIds = [options.projectId];
    }
    const projectObjectIds = projectIds.map((id) => new ObjectId(id));

    const [projects, tasks, hours, prompts] = await Promise.all([
      ProjectModel.find({ _id: { $in: projectObjectIds } })
        .select({ name: 1, color: 1 })
        .lean(),
      this.taskStats(projectObjectIds, since),
      this.hourStats(projectObjectIds, since),
      this.promptStats(access, options.projectId, since),
    ]);
    const projectName = new Map(projects.map((p) => [String(p._id), p.name]));
    const nameOf = (id: string) => projectName.get(id) ?? "Unknown project";

    const byProject = projects
      .map((p) => {
        const id = String(p._id);
        const t = tasks.byProject.get(id);
        return {
          projectId: id,
          name: p.name,
          color: p.color ?? null,
          open: t?.open ?? 0,
          overdue: t?.overdue ?? 0,
          blocked: t?.blocked ?? 0,
          completed: t?.completedInRange ?? 0,
          hours: round(hours.byProject.get(id) ?? 0),
        };
      })
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

    return {
      scope: {
        workspaceId: access.workspaceId,
        projectCount: projectIds.length,
        projectId: options.projectId ?? null,
        timeRange: range,
        since: since?.toISOString() ?? null,
        generatedAt: new Date().toISOString(),
      },
      tasks: {
        open: tasks.totals.open,
        created: tasks.totals.createdInRange,
        completed: tasks.totals.completedInRange,
        overdue: tasks.totals.overdue,
        blocked: tasks.totals.blocked,
        stale: tasks.totals.stale,
        // Share of tasks created in the period that are already done.
        completionRate:
          tasks.totals.createdInRange > 0
            ? Math.min(
                100,
                Math.round(
                  (tasks.totals.createdDoneInRange /
                    tasks.totals.createdInRange) *
                    100,
                ),
              )
            : null,
        byStatus: tasks.byStatus,
        weekly: tasks.weekly,
      },
      hours: {
        total: round(hours.total),
        byMember: hours.byMember,
        weekly: hours.weekly,
      },
      prompts,
      projects: byProject,
      attention: this.attention(tasks.byProject, nameOf),
    };
  }

  private async taskStats(
    projectIds: mongoose.Types.ObjectId[],
    since: Date | null,
  ) {
    const now = today();
    const staleBefore = new Date(Date.now() - STALE_DAYS * DAY);
    const inRange = (field: string) =>
      since ? { $gte: [field, since] } : { $ne: [field, null] };
    const isOpen = { $ne: ["$status", "DONE"] };

    const [facets] = await TaskModel.aggregate<{
      byProject: Array<{
        _id: unknown;
        open: number;
        overdue: number;
        blocked: number;
        stale: number;
        unassigned: number;
        createdInRange: number;
        createdDoneInRange: number;
        completedInRange: number;
      }>;
      byStatus: Array<{ _id: string; count: number }>;
      created: Array<{ _id: string; count: number }>;
      completed: Array<{ _id: string; count: number }>;
    }>([
      { $match: { projectId: { $in: projectIds } } },
      {
        $facet: {
          byProject: [
            {
              $group: {
                _id: "$projectId",
                open: { $sum: { $cond: [isOpen, 1, 0] } },
                overdue: {
                  $sum: {
                    $cond: [{ $and: [isOpen, { $lt: ["$date", now] }] }, 1, 0],
                  },
                },
                blocked: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          isOpen,
                          {
                            $or: [
                              { $eq: ["$status", "BLOCKED"] },
                              { $eq: ["$isBlocked", true] },
                            ],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                stale: {
                  $sum: {
                    $cond: [
                      { $and: [isOpen, { $lt: ["$updatedAt", staleBefore] }] },
                      1,
                      0,
                    ],
                  },
                },
                unassigned: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          isOpen,
                          { $not: [{ $ifNull: ["$assignedTo", false] }] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                createdInRange: {
                  $sum: { $cond: [inRange("$createdAt"), 1, 0] },
                },
                createdDoneInRange: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          inRange("$createdAt"),
                          { $eq: ["$status", "DONE"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                completedInRange: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$status", "DONE"] },
                          inRange({
                            $ifNull: ["$completedAt", "$updatedAt"],
                          } as never),
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          byStatus: [
            { $match: { status: { $ne: "rolled_over" } } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
          created: [
            ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
            { $group: { _id: this.weekOf("$createdAt"), count: { $sum: 1 } } },
          ],
          completed: [
            {
              $match: {
                status: "DONE",
                ...(since
                  ? { completedAt: { $gte: since } }
                  : { completedAt: { $ne: null } }),
              },
            },
            {
              $group: { _id: this.weekOf("$completedAt"), count: { $sum: 1 } },
            },
          ],
        },
      },
    ]);

    const byProject = new Map(
      facets.byProject.map((row) => [String(row._id), row]),
    );
    const sum = (key: keyof (typeof facets.byProject)[number]) =>
      facets.byProject.reduce((acc, row) => acc + (row[key] as number), 0);

    const weeks = new Map<
      string,
      { week: string; created: number; completed: number }
    >();
    for (const row of facets.created) {
      weeks.set(row._id, { week: row._id, created: row.count, completed: 0 });
    }
    for (const row of facets.completed) {
      const entry = weeks.get(row._id) ?? {
        week: row._id,
        created: 0,
        completed: 0,
      };
      entry.completed = row.count;
      weeks.set(row._id, entry);
    }

    const order = [
      "BACKLOG",
      "TODO",
      "IN_PROGRESS",
      "IN_REVIEW",
      "BLOCKED",
      "DONE",
    ];
    return {
      totals: {
        open: sum("open"),
        overdue: sum("overdue"),
        blocked: sum("blocked"),
        stale: sum("stale"),
        createdInRange: sum("createdInRange"),
        createdDoneInRange: sum("createdDoneInRange"),
        completedInRange: sum("completedInRange"),
      },
      byProject,
      byStatus: order.map((status) => ({
        status,
        count: facets.byStatus.find((s) => s._id === status)?.count ?? 0,
      })),
      weekly: [...weeks.values()]
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-26),
    };
  }

  private async hourStats(
    projectIds: mongoose.Types.ObjectId[],
    since: Date | null,
  ) {
    const match = {
      projectId: { $in: projectIds },
      ...(since
        ? { entryDate: { $gte: new Date(since.toISOString().slice(0, 10)) } }
        : {}),
    };
    const [facets] = await TimeEntryModel.aggregate<{
      total: Array<{ hours: number }>;
      byProject: Array<{ _id: unknown; hours: number }>;
      byMember: Array<{ _id: unknown; hours: number }>;
      weekly: Array<{ _id: string; hours: number }>;
    }>([
      { $match: match },
      {
        $facet: {
          total: [{ $group: { _id: null, hours: { $sum: "$hours" } } }],
          byProject: [
            { $group: { _id: "$projectId", hours: { $sum: "$hours" } } },
          ],
          byMember: [
            { $group: { _id: "$userId", hours: { $sum: "$hours" } } },
            { $sort: { hours: -1 } },
            { $limit: 12 },
          ],
          weekly: [
            {
              $group: {
                _id: this.weekOf("$entryDate"),
                hours: { $sum: "$hours" },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);
    const users = await UserModel.find({
      _id: { $in: facets.byMember.map((m) => String(m._id)) },
    })
      .select({ name: 1, email: 1 })
      .lean();
    const userName = new Map(
      users.map((u) => [String(u._id), u.name || u.email]),
    );
    return {
      total: facets.total[0]?.hours ?? 0,
      byProject: new Map(facets.byProject.map((p) => [String(p._id), p.hours])),
      byMember: facets.byMember.map((m) => ({
        userId: String(m._id),
        name: userName.get(String(m._id)) ?? "Former member",
        hours: round(m.hours),
      })),
      weekly: facets.weekly
        .slice(-26)
        .map((w) => ({ week: w._id, hours: round(w.hours) })),
    };
  }

  /** Prompts the member can see, ranked by use. */
  private async promptStats(
    access: WorkspaceAccess,
    projectId: string | undefined,
    since: Date | null,
  ) {
    const visible = await accessService.promptVisibilityFilter(access);
    const match = {
      ...visible,
      isLatest: true,
      isArchived: false,
      ...(projectId ? { projectId: new ObjectId(projectId) } : {}),
    };
    const [total, used, createdInRange, top, byCategory] = await Promise.all([
      PromptLibraryModel.countDocuments(match),
      PromptLibraryModel.countDocuments({ ...match, usageCount: { $gt: 0 } }),
      since
        ? PromptLibraryModel.countDocuments({
            ...match,
            createdAt: { $gte: since },
          })
        : Promise.resolve(null),
      PromptLibraryModel.find({ ...match, usageCount: { $gt: 0 } })
        .sort({ usageCount: -1, updatedAt: -1 })
        .limit(8)
        .select({ name: 1, usageCount: 1, lastUsedAt: 1, category: 1 })
        .lean(),
      PromptLibraryModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    return {
      total,
      used,
      createdInRange,
      top: top.map((p) => ({
        id: String(p._id),
        name: p.name,
        category: p.category ?? null,
        uses: p.usageCount ?? 0,
        lastUsedAt: p.lastUsedAt ?? null,
      })),
      byCategory: byCategory.map((c) => ({
        category: c._id ?? "uncategorized",
        count: c.count,
      })),
    };
  }

  /** The few things worth acting on, biggest first. */
  private attention(
    byProject: Map<
      string,
      { overdue: number; blocked: number; stale: number; unassigned: number }
    >,
    nameOf: (id: string) => string,
  ): AttentionItem[] {
    const items: AttentionItem[] = [];
    const plural = (n: number, word: string) =>
      `${n} ${word}${n === 1 ? "" : "s"}`;
    for (const [projectId, row] of byProject) {
      const projectName = nameOf(projectId);
      if (row.overdue) {
        items.push({
          kind: "overdue",
          projectId,
          projectName,
          count: row.overdue,
          message: `${plural(row.overdue, "task")} past due in ${projectName}`,
        });
      }
      if (row.blocked) {
        items.push({
          kind: "blocked",
          projectId,
          projectName,
          count: row.blocked,
          message: `${plural(row.blocked, "task")} blocked in ${projectName}`,
        });
      }
      if (row.stale) {
        items.push({
          kind: "stale",
          projectId,
          projectName,
          count: row.stale,
          message: `${plural(row.stale, "open task")} untouched for ${STALE_DAYS}+ days in ${projectName}`,
        });
      }
      if (row.unassigned) {
        items.push({
          kind: "unassigned",
          projectId,
          projectName,
          count: row.unassigned,
          message: `${plural(row.unassigned, "open task")} with no owner in ${projectName}`,
        });
      }
    }
    const weight = { overdue: 4, blocked: 3, stale: 2, unassigned: 1 } as const;
    return items
      .sort((a, b) => weight[b.kind] * b.count - weight[a.kind] * a.count)
      .slice(0, 8);
  }

  private weekOf(field: string) {
    return {
      $dateToString: { format: "%G-W%V", date: field, timezone: "UTC" },
    };
  }
}

export default new InsightsService();
