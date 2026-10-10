import { effectivePermissions } from "../../src/modules/access/permissions.js";
/** A resolved workspace access for tests; admin unless a role is given. */
export const fakeAccess = (overrides = {}) => {
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
