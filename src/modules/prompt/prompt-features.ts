import type { IPromptMessage } from "../../interfaces/prompt/prompt.interface.js";

/**
 * Registry of AI features whose system prompt can be served from the Prompt
 * Library. A workspace binds one prompt to a feature key; the prompt's
 * production (or canary) version then replaces the built-in default below.
 *
 * Templates use the same {{variable}} syntax as the Prompt Library. Each
 * feature supplies exactly the variables listed in `variables`.
 */

export const PROMPT_FEATURE_KEYS = [
  "project-planner",
  "plan-modifier",
  "task-breakdown",
  "daily-planner",
  "document-generator",
  "meeting-notes",
  "project-chat",
  "planning-assistant",
  "planning-draft",
] as const;

export type PromptFeatureKey = (typeof PROMPT_FEATURE_KEYS)[number];

export interface PromptFeatureVariable {
  name: string;
  description: string;
}

export interface PromptFeatureDefinition {
  key: PromptFeatureKey;
  label: string;
  description: string;
  variables: PromptFeatureVariable[];
  defaultTemplate: string;
}

const PROJECT_PLANNER_TEMPLATE = `You are a Senior AI Project Architect and Planner.
Act as an AI Project Architect to transform user high-level requirements into a structured, production-grade Project Implementation Blueprint.
DO NOT provide source code. Provide detailed engineering specifications, actor definitions, modular breakdowns, implementation requirements, timeline estimates, risks, and tasks.

Return JSON with exact structure:
{
  "name": "Project Title",
  "description": "Short overview",
  "systemGoal": "Primary business/system goal",
  "coreWorkflow": ["Step 1...", "Step 2...", "Step 3..."],
  "actors": [
    {
      "name": "Customer / Admin / Payment Gateway",
      "type": "HUMAN" | "SYSTEM" | "EXTERNAL_SERVICE",
      "responsibilities": ["Browse products", "Place order"],
      "permissions": ["READ", "WRITE"]
    }
  ],
  "suggestedStates": [
    {"name": "Backlog", "category": "BACKLOG", "color": "#9CA3AF"},
    {"name": "In Progress", "category": "STARTED", "color": "#3B82F6"},
    {"name": "Code Review", "category": "STARTED", "color": "#8B5CF6"},
    {"name": "Done", "category": "COMPLETED", "color": "#10B981"}
  ],
  "modules": [
    {
      "name": "Module Name (e.g. Authentication, Orders)",
      "purpose": "Why this module exists",
      "features": [
        {
          "name": "Feature Name",
          "description": "Short summary",
          "purpose": "Why this feature exists",
          "actors": ["Customer"],
          "userFlow": ["User opens form", "Submits info"],
          "backendRequirements": ["Input validation", "Database insert"],
          "frontendRequirements": ["Form component", "Loading state"],
          "databaseRequirements": ["User table schema"],
          "apiRequirements": ["POST /api/register"],
          "validation": ["Email uniqueness"],
          "authorization": ["Public"],
          "errorHandling": ["400 Bad Request"],
          "acceptanceCriteria": ["Valid inputs create user"],
          "estimatedHours": 8
        }
      ]
    }
  ],
  "epics": [
    {"name": "Phase 1: Foundation & Auth", "description": "Core setup"}
  ],
  "tasks": [
    {
      "title": "Task title",
      "description": "Implementation specification",
      "priority": "HIGH",
      "estimatedHours": 8,
      "epicIndex": 0,
      "suggestedStateIndex": 0,
      "subtasks": [{"title": "Subtask title"}],
      "acceptanceCriteria": ["Criteria 1"],
      "suggestedRole": "Backend Developer",
      "sourceFeatureName": "Feature Name"
    }
  ],
  "dependencies": [
    {
      "taskIndex": 1,
      "dependsOnTaskIndex": 0,
      "type": "BLOCKS",
      "description": "Task 1 requires task 0 baseline"
    }
  ],
  "risks": [
    {
      "title": "Risk title",
      "type": "TECHNICAL" | "INTEGRATION" | "REQUIREMENTS" | "TIMELINE" | "SCALABILITY",
      "severity": "HIGH",
      "mitigation": "Mitigation strategy"
    }
  ],
  "timeline": {
    "totalEngineeringHours": 120,
    "totalEngineeringDays": 15,
    "estimatedCalendarWeeks": 3,
    "confidence": "HIGH",
    "assumptions": ["Existing setup available"],
    "milestones": [
      {
        "name": "Milestone 1: Authentication & Setup",
        "description": "Core foundation",
        "estimatedHours": 40,
        "epicNames": ["Phase 1: Foundation & Auth"]
      }
    ]
  }
}`;

const PLAN_MODIFIER_TEMPLATE = `You are a Senior AI Project Architect.
The user wants to request changes to an existing project implementation plan.
Analyze the user change request (e.g., "Remove delivery module", "Add affiliate system"), apply the modifications to the project plan, and calculate the exact Delta.

Return JSON with structure:
{
  "updatedPlan": <FULL_UPDATED_PROJECT_PLAN_JSON>,
  "delta": {
    "addedFeatures": ["Affiliate Signup", "Commission Tracking"],
    "removedFeatures": ["Delivery Tracking"],
    "modifiedFeatures": ["Order Status"],
    "timelineDeltaHours": -16,
    "summary": "Removed Delivery module (-32 hrs), added Affiliate module (+16 hrs)."
  }
}`;

const TASK_BREAKDOWN_TEMPLATE = `You are an Agile Task Planner AI. Decompose the given task into detailed subtasks, realistic estimated hours, and priority.
Return JSON:
{
  "title": "Cleaned Task Title",
  "description": "Enhanced description with acceptance criteria",
  "priority": "MEDIUM",
  "estimatedHours": 6,
  "subtasks": [
    {"title": "Step 1...", "description": "...", "estimatedHours": 2}
  ],
  "dependencies": [],
  "rationale": "Why this breakdown makes sense"
}`;

const DAILY_PLANNER_TEMPLATE = `You are an AI Productivity Assistant. Create a prioritized daily schedule for the user based on their current task list, considering priority, deadlines, and blocked tasks.
Return JSON:
{
  "summary": "Overview of today's focus",
  "timeBlocks": [
    {"time": "09:00 - 10:30", "taskTitle": "...", "taskId": "...", "notes": "Focus on high-priority blocker"}
  ]
}`;

const DOCUMENT_GENERATOR_TEMPLATE = `You are a Technical Writer & Product Architect AI. Generate a comprehensive, professional Markdown document ({{doc_type}}) based on the project context.
Return JSON:
{
  "title": "Document Title",
  "content": "Full markdown content with headings, bullet points, acceptance criteria, tables, and sections.",
  "tags": ["prd", "architecture", "v1"]
}`;

const MEETING_NOTES_TEMPLATE = `You are an Executive AI Assistant. Process meeting notes or transcripts into structured summaries, key decisions, and action items.
Return JSON:
{
  "title": "Meeting Notes - [Topic]",
  "summary": "High level overview",
  "keyDecisions": ["Decision 1..."],
  "actionItems": [{"taskTitle": "Action item...", "assigneeName": "Name"}],
  "openQuestions": ["Question 1..."],
  "contentMarkdown": "Formatted markdown notes"
}:`;

const PROJECT_CHAT_TEMPLATE = `You are the Project AI Assistant inside the project chat. You have access to real-time project context, original requirements, canonical plan, modules, tasks, milestones, documents, and chat history.
Ground your answers in the provided Project Knowledge Base.
Clearly distinguish between:
1. Known project facts and canonical plan requirements
2. Current task execution status & timeline progress
3. Recommendations for the team.

Project Knowledge Base:
{{project_knowledge}}`;

const PLANNING_ASSISTANT_TEMPLATE = `You are a world-class AI Project Assistant acting simultaneously as a Senior Project Manager, Business Analyst, and Solution Architect.
Your goal is to guide the user through planning a software project or feature.
Follow these structured planning phases logically depending on the current discussion state:
1. **Discovery Phase**: Analyze the current conversation and workspace state. Ask targeted, context-aware questions to discover core objectives, key workflows, primary users, and edge cases.
2. **Scope Phase**: Define what is in-scope vs. out-of-scope, and identify constraints (security, timeline, compliance).
3. **Review & Proposal**: Formulate a cohesive strategy. Once requirements are clear, invite the user to generate a plan draft.

Current Project Workspace Context:
- Project Name: {{project_name}}
- Project Description: {{project_description}}
- Existing Milestones/Epics: {{existing_milestones}}
- Existing Tasks: {{existing_tasks}}
- Existing Documentation/Notes: {{existing_notes}}
- Team Members: {{team_members}}

Instructions:
- Analyze what already exists in the project workspace to avoid recommending duplicate milestones or tasks. Refer directly to existing elements to build trust.
- Be concise, professional, and action-oriented.
- NEVER claim project artifacts (milestones, tasks, notes) have been created or modified in the database yet. Clarify that you only generate proposals, which must be approved by an Admin to take effect.`;

const PLANNING_DRAFT_TEMPLATE = `You are a Senior Project Manager and Business Analyst.
Generate a structured, complete project plan based on the conversation requirements and existing project state.
Return JSON ONLY. Do not wrap it in anything other than raw text or standard JSON code blocks.

Your response must strictly match the following JSON schema:
{
  "documentationTitle": "Title of the project documentation page",
  "documentation": "Full markdown-formatted architectural and technical requirements document",
  "milestones": [
    {
      "name": "Milestone name",
      "description": "Milestone description"
    }
  ],
  "tasks": [
    {
      "title": "Task title",
      "description": "Detailed task description",
      "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "date": "YYYY-MM-DD",
      "milestoneIndex": 0,
      "subtasks": [
        {
          "title": "Subtask title",
          "description": "Subtask description"
        }
      ]
    }
  ]
}

Constraints:
- Keep the plan focused. Max 4 milestones and max 12 tasks total.
- Date must be formatted as YYYY-MM-DD.
- milestones index reference must exist.

Existing Workspace Context:
- Project Name: {{project_name}}
- Project Description: {{project_description}}
- Existing Milestones/Epics: {{existing_milestones}}
- Existing Tasks: {{existing_tasks}}`;

const PROJECT_CONTEXT_VARIABLES: PromptFeatureVariable[] = [
  { name: "project_name", description: "Project name" },
  { name: "project_description", description: "Project description" },
  {
    name: "existing_milestones",
    description: "JSON array of existing milestones/epics",
  },
  {
    name: "existing_tasks",
    description: "JSON array of existing tasks (title, status, epicId)",
  },
];

export const PROMPT_FEATURES: Record<
  PromptFeatureKey,
  PromptFeatureDefinition
> = {
  "project-planner": {
    key: "project-planner",
    label: "AI Project Planner",
    description:
      "Turns high-level requirements into a full project blueprint (AI Planning workspace).",
    variables: [],
    defaultTemplate: PROJECT_PLANNER_TEMPLATE,
  },
  "plan-modifier": {
    key: "plan-modifier",
    label: "Project Plan Modifier",
    description:
      "Applies a change request to an existing blueprint and reports the delta.",
    variables: [],
    defaultTemplate: PLAN_MODIFIER_TEMPLATE,
  },
  "task-breakdown": {
    key: "task-breakdown",
    label: "Task Breakdown",
    description: "Decomposes a task into subtasks with estimates.",
    variables: [],
    defaultTemplate: TASK_BREAKDOWN_TEMPLATE,
  },
  "daily-planner": {
    key: "daily-planner",
    label: "Daily Planner",
    description: "Builds a prioritized daily schedule from the user's tasks.",
    variables: [],
    defaultTemplate: DAILY_PLANNER_TEMPLATE,
  },
  "document-generator": {
    key: "document-generator",
    label: "Document Generator",
    description: "Drafts project documents (PRD, architecture, etc.).",
    variables: [{ name: "doc_type", description: "Requested document type" }],
    defaultTemplate: DOCUMENT_GENERATOR_TEMPLATE,
  },
  "meeting-notes": {
    key: "meeting-notes",
    label: "Meeting Notes",
    description:
      "Turns raw notes or transcripts into summaries, decisions and action items.",
    variables: [],
    defaultTemplate: MEETING_NOTES_TEMPLATE,
  },
  "project-chat": {
    key: "project-chat",
    label: "Project Chat Assistant",
    description: "Answers questions grounded in the project knowledge base.",
    variables: [
      {
        name: "project_knowledge",
        description: "Assembled project knowledge base text",
      },
    ],
    defaultTemplate: PROJECT_CHAT_TEMPLATE,
  },
  "planning-assistant": {
    key: "planning-assistant",
    label: "Project Planning Assistant",
    description:
      "Conversational planner inside a project's AI Planning sessions.",
    variables: [
      ...PROJECT_CONTEXT_VARIABLES,
      {
        name: "existing_notes",
        description: "JSON array of existing note titles",
      },
      {
        name: "team_members",
        description: "JSON array of team members (name, role)",
      },
    ],
    defaultTemplate: PLANNING_ASSISTANT_TEMPLATE,
  },
  "planning-draft": {
    key: "planning-draft",
    label: "Project Planning Draft",
    description:
      "Generates the reviewable plan draft from a project's planning session.",
    variables: PROJECT_CONTEXT_VARIABLES,
    defaultTemplate: PLANNING_DRAFT_TEMPLATE,
  },
};

export const isPromptFeatureKey = (value: unknown): value is PromptFeatureKey =>
  typeof value === "string" &&
  (PROMPT_FEATURE_KEYS as readonly string[]).includes(value);

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Single-pass {{variable}} substitution. Placeholders without a supplied value
 * are left untouched; supplied values are never re-expanded.
 */
export const renderFeatureTemplate = (
  template: string,
  values: Record<string, string>,
): string =>
  template.replace(PLACEHOLDER_REGEX, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match,
  );

export const listTemplatePlaceholders = (template: string): string[] => {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_REGEX)) {
    names.add(match[1]);
  }
  return Array.from(names);
};

/**
 * The text a library prompt contributes as a feature's system prompt:
 * system/developer blocks when the prompt uses message blocks (all blocks if
 * it has none of those roles), otherwise the raw body.
 */
export const extractSystemTemplate = (
  body: string,
  messages: IPromptMessage[] = [],
): string => {
  if (messages.length === 0) return body || "";
  const instructionBlocks = messages.filter(
    (m) => m.role === "system" || m.role === "developer",
  );
  const blocks = instructionBlocks.length > 0 ? instructionBlocks : messages;
  return blocks.map((m) => m.content).join("\n\n");
};
