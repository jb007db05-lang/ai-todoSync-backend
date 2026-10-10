import type { WorkspaceRole } from "../workspace/models/workspace-member.model.js";

/**
 * Per-member permission flags. A workspace admin toggles each flag for each
 * member individually; owners and admins bypass the checks entirely.
 *
 * This catalog is the single source of truth: the API, the permission matrix
 * UI and the docs are all generated from it.
 */
export const PERMISSIONS = [
  {
    key: "project.create",
    group: "Projects",
    label: "Create projects",
    description: "Create new projects in the workspace.",
  },
  {
    key: "project.update",
    group: "Projects",
    label: "Edit projects",
    description: "Edit details of projects they can access.",
  },
  {
    key: "project.delete",
    group: "Projects",
    label: "Delete projects",
    description: "Delete projects they can access.",
  },
  {
    key: "task.update_status",
    group: "Projects",
    label: "Update task status",
    description: "Move tasks between statuses in projects they can access.",
  },
  {
    key: "prompt.access",
    group: "Prompts",
    label: "View prompts",
    description:
      "Open prompts they own, were shared or belong to their projects.",
  },
  {
    key: "prompt.create",
    group: "Prompts",
    label: "Create prompts",
    description: "Create prompts and edit their own prompts.",
  },
  {
    key: "library.access",
    group: "Prompts",
    label: "Use the prompt library",
    description: "Browse the workspace prompt library and playground.",
  },
  {
    key: "prompt.add_to_project",
    group: "Prompts",
    label: "Attach prompts to projects",
    description: "Link prompts to projects they can access.",
  },
  {
    key: "prompt.share_individual",
    group: "Prompts",
    label: "Share prompts with teammates",
    description: "Give a specific teammate access to a specific prompt.",
  },
  {
    key: "intelligence.view",
    group: "Insights",
    label: "View insights",
    description: "See the insights page for projects they can access.",
  },
  {
    key: "intelligence.analyze",
    group: "Insights",
    label: "Run analyses",
    description: "Drill into metrics, explain changes and forecast.",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export type PermissionSet = Record<PermissionKey, boolean>;

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export const isPermissionKey = (value: unknown): value is PermissionKey =>
  typeof value === "string" && (PERMISSION_KEYS as string[]).includes(value);

/** Roles that bypass permission checks inside their workspace. */
export const ADMIN_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN"];

export const isAdminRole = (role: WorkspaceRole | undefined): boolean =>
  role !== undefined && ADMIN_ROLES.includes(role);

const grant = (...keys: PermissionKey[]): PermissionSet =>
  Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, keys.includes(key)]),
  ) as PermissionSet;

/**
 * Starting permissions for a new member of each role. Admins can change any
 * flag afterwards; these only decide what a fresh invite can do.
 */
export const ROLE_DEFAULTS: Record<WorkspaceRole, PermissionSet> = {
  OWNER: grant(...PERMISSION_KEYS),
  ADMIN: grant(...PERMISSION_KEYS),
  MANAGER: grant(
    "project.create",
    "project.update",
    "task.update_status",
    "prompt.access",
    "prompt.create",
    "library.access",
    "prompt.add_to_project",
    "prompt.share_individual",
    "intelligence.view",
    "intelligence.analyze",
  ),
  MEMBER: grant(
    "task.update_status",
    "prompt.access",
    "prompt.create",
    "library.access",
    "intelligence.view",
  ),
  GUEST: grant("prompt.access"),
};

/**
 * Effective permissions: role defaults overlaid with the member's stored
 * flags (unknown keys are ignored), and everything for admins.
 */
export const effectivePermissions = (
  role: WorkspaceRole,
  stored?: Partial<Record<string, unknown>> | null,
): PermissionSet => {
  if (isAdminRole(role)) return grant(...PERMISSION_KEYS);
  const base = { ...(ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.GUEST) };
  for (const key of PERMISSION_KEYS) {
    const value = stored?.[key];
    if (typeof value === "boolean") base[key] = value;
  }
  return base;
};

/** Validates a permission patch from the API: only known keys, only booleans. */
export const parsePermissionPatch = (
  value: unknown,
): Partial<PermissionSet> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const patch: Partial<PermissionSet> = {};
  for (const [key, flag] of Object.entries(value)) {
    if (!isPermissionKey(key) || typeof flag !== "boolean") return null;
    patch[key] = flag;
  }
  return patch;
};
