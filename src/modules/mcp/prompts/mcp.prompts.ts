/**
 * MCP Prompts — server-provided workflow templates.
 * These guide AI clients through common TodoSync workflows.
 */

export interface McpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: McpPromptArgument[];
  template: string;
}

export const MCP_PROMPTS: McpPrompt[] = [
  {
    name: "daily_planning",
    description:
      "Guide an AI through planning the user's workday. Fetches context, then generates a prioritized schedule.",
    arguments: [
      {
        name: "date",
        description: "ISO date string (e.g. 2024-01-15). Defaults to today.",
        required: false,
      },
    ],
    template: `You are a productivity assistant helping the user plan their day.

Step 1: Call intelligence:daily_context with date={{ date | today }} to get the user's full work context.
Step 2: Review the todaysTasks, highPriorityTasks, blockedTasks, and slaAnalytics from the response.
Step 3: Call ai:plan_daily_work with the open tasks to generate a time-blocked schedule.
Step 4: Present the schedule to the user with:
  - Time blocks with task assignments
  - Blocked tasks that need attention
  - SLA breach warnings if any
  - 3-5 focus recommendations

Do not modify any tasks without explicit user instruction.`,
  },
  {
    name: "project_review",
    description:
      "Guide an AI through reviewing a project's health, risks, and recommended next actions.",
    arguments: [
      {
        name: "projectId",
        description: "The project ID to review.",
        required: true,
      },
    ],
    template: `You are a project intelligence assistant performing a project health review.

Step 1: Call intelligence:project_performance with projectId={{ projectId }} to get the health report and operational analysis.
Step 2: Call project:list_blocked with projectId={{ projectId }} to find blocked tasks.
Step 3: Call project:list_overdue with projectId={{ projectId }} to find overdue tasks.
Step 4: Call sla:get_analytics to get SLA compliance data.
Step 5: Synthesize and present:
  - Overall health score and trend
  - Top 3 risks with severity and recommended mitigation
  - Blocked tasks count and critical path impact
  - Overdue tasks requiring immediate attention
  - SLA compliance summary
  - 3-5 prioritized recommendations

Be specific and actionable. Ground all claims in data from the tool responses.`,
  },
  {
    name: "standup",
    description:
      "Help the user prepare for a standup meeting by summarizing what they completed, what they're working on, and blockers.",
    arguments: [],
    template: `You are helping the user prepare their standup update.

Step 1: Call task:summary to get counts by status.
Step 2: Call task:list_mine to get tasks assigned to the user.
Step 3: Call task:list_blocked to identify any blockers.
Step 4: Call activity:recent with limit=20 to see what changed recently.

Based on the results, generate a standup update in this format:

**Yesterday:**
[Tasks completed — status DONE or recently transitioned]

**Today:**
[In-progress and TODO tasks, by priority]

**Blockers:**
[Blocked tasks with blocker description]

Keep it concise — no more than 5 bullet points per section.`,
  },
  {
    name: "task_decomposition",
    description:
      "Decompose a high-level task into implementable subtasks and optionally create them.",
    arguments: [
      {
        name: "taskId",
        description: "Task to decompose. Provide either taskId or taskTitle.",
        required: false,
      },
      {
        name: "taskTitle",
        description: "Title of a new task to decompose.",
        required: false,
      },
    ],
    template: `You are helping the user break down a complex task into subtasks.

Step 1: If taskId provided, call task:get with taskId={{ taskId }} to get task details.
Step 2: Call ai:decompose_task with the task title and description to get an AI breakdown.
Step 3: Present the subtasks to the user for review.
Step 4: If the user approves, call task:update with taskId and the subtasks array to save them.

Do not create or modify tasks without explicit user approval.`,
  },
];

export function listMcpPrompts(): McpPrompt[] {
  return MCP_PROMPTS;
}

export function getMcpPrompt(name: string): McpPrompt | null {
  return MCP_PROMPTS.find((p) => p.name === name) ?? null;
}
