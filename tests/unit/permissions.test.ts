import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  PERMISSION_KEYS,
  ROLE_DEFAULTS,
  effectivePermissions,
  isAdminRole,
  parsePermissionPatch,
} from "../../src/modules/access/permissions.js";
import accessService, { can } from "../../src/modules/access/access.service.js";
import { fakeAccess } from "../../src/modules/access/access.fixtures.js";
import { AppError } from "../../src/utils/app-error.js";

describe("Permission model", () => {
  test("the catalog has every permission from the spec", () => {
    assert.deepEqual([...PERMISSION_KEYS].sort(), [
      "intelligence.analyze",
      "intelligence.view",
      "library.access",
      "project.create",
      "project.delete",
      "project.update",
      "prompt.access",
      "prompt.add_to_project",
      "prompt.create",
      "prompt.share_individual",
      "task.update_status",
    ]);
  });

  test("owners and admins hold every permission, whatever is stored", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      assert.ok(isAdminRole(role));
      const perms = effectivePermissions(role, { "project.delete": false });
      assert.ok(
        PERMISSION_KEYS.every((k) => perms[k]),
        role,
      );
    }
  });

  test("stored flags override role defaults for regular members", () => {
    assert.equal(ROLE_DEFAULTS.MEMBER["project.create"], false);
    const perms = effectivePermissions("MEMBER", {
      "project.create": true,
      "task.update_status": false,
    });
    assert.equal(perms["project.create"], true);
    assert.equal(perms["task.update_status"], false);
    assert.equal(perms["prompt.access"], ROLE_DEFAULTS.MEMBER["prompt.access"]);
  });

  test("unknown or non-boolean stored values are ignored", () => {
    const perms = effectivePermissions("GUEST", {
      "project.create": "yes",
      "made.up": true,
    } as Record<string, unknown>);
    assert.deepEqual(perms, ROLE_DEFAULTS.GUEST);
  });

  test("each flag can be toggled independently", () => {
    for (const key of PERMISSION_KEYS) {
      const on = effectivePermissions("GUEST", { [key]: true });
      const others = PERMISSION_KEYS.filter((k) => k !== key);
      assert.equal(on[key], true, key);
      assert.ok(
        others.every((k) => on[k] === ROLE_DEFAULTS.GUEST[k]),
        key,
      );
    }
  });

  test("permission patches accept only known keys mapped to booleans", () => {
    assert.deepEqual(parsePermissionPatch({ "prompt.create": true }), {
      "prompt.create": true,
    });
    assert.equal(parsePermissionPatch({ "prompt.create": "true" }), null);
    assert.equal(parsePermissionPatch({ "admin.everything": true }), null);
    assert.equal(parsePermissionPatch(["prompt.create"]), null);
    assert.equal(parsePermissionPatch(null), null);
  });
});

describe("Permission checks", () => {
  test("admins bypass, members need the flag", () => {
    assert.ok(can(fakeAccess(), "project.delete"));
    const member = fakeAccess({ role: "MEMBER" });
    assert.equal(can(member, "project.delete"), false);
    assert.equal(can(member, "prompt.access"), true);
  });

  test("require() throws 403 naming the missing permission", () => {
    const member = fakeAccess({ role: "MEMBER" });
    assert.throws(
      () => accessService.require(member, "prompt.access", "project.create"),
      (e: unknown) =>
        e instanceof AppError &&
        e.status === 403 &&
        e.message.includes("Create projects"),
    );
    assert.doesNotThrow(() => accessService.require(member, "prompt.access"));
  });

  test("malformed workspace ids are 404, never a database error", async () => {
    await assert.rejects(
      accessService.resolve("000000000000000000000002", "not-an-id"),
      (e: unknown) => e instanceof AppError && e.status === 404,
    );
  });
});
