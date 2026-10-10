/** Test fixtures: a resolved WorkspaceAccess without touching the database. */
import type { WorkspaceAccess } from "./access.service.js";
import { effectivePermissions } from "./permissions.js";
import type { WorkspaceRole } from "../workspace/models/workspace-member.model.js";

/** A resolved workspace access for tests; admin unless a role is given. */
export const fakeAccess = (
  overrides: Partial<WorkspaceAccess> & { role?: WorkspaceRole } = {},
): WorkspaceAccess => {
  const role = overrides.role ?? "ADMIN";
  return {
    workspaceId: "000000000000000000000001",
    userId: "000000000000000000000002",
    memberId: "000000000000000000000003",
    isAdmin: role === "OWNER" || role === "ADMIN",
    permissions: effectivePermissions(role),
    ...overrides,
    role,
  };
};
