import { AppError } from "../../utils/app-error.js";
import type { WorkspaceRole } from "./models/workspace-member.model.js";

const VALID_ROLES: WorkspaceRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "MEMBER",
  "GUEST",
];

function slugify(text: string): string {
  return (
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "") || "workspace"
  );
}

export function validateCreateWorkspace(body: unknown): {
  name: string;
  slug?: string;
} {
  if (!body || typeof body !== "object") {
    throw new AppError(422, "Request body is required", "VALIDATION_ERROR");
  }
  const { name, slug } = body as Record<string, unknown>;
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError(422, "Workspace name is required", "VALIDATION_ERROR");
  }
  if (slug !== undefined && typeof slug !== "string") {
    throw new AppError(422, "Slug must be a string", "VALIDATION_ERROR");
  }
  return {
    name: String(name).trim().slice(0, 100),
    slug: slug ? slugify(String(slug)) : undefined,
  };
}

export function validateUpdateWorkspace(body: unknown): {
  name?: string;
  slug?: string;
  settings?: { defaultProjectRole?: string; allowGuestInvites?: boolean };
} {
  if (!body || typeof body !== "object") {
    throw new AppError(422, "Request body is required", "VALIDATION_ERROR");
  }
  const { name, slug, settings } = body as Record<string, unknown>;
  const result: ReturnType<typeof validateUpdateWorkspace> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError(
        422,
        "Name must be a non-empty string",
        "VALIDATION_ERROR",
      );
    }
    result.name = String(name).trim().slice(0, 100);
  }
  if (slug !== undefined) {
    if (typeof slug !== "string") {
      throw new AppError(422, "Slug must be a string", "VALIDATION_ERROR");
    }
    result.slug = slugify(String(slug));
  }
  if (settings !== undefined) {
    if (typeof settings !== "object" || settings === null) {
      throw new AppError(422, "Settings must be an object", "VALIDATION_ERROR");
    }
    result.settings = {};
    const s = settings as Record<string, unknown>;
    if (s.defaultProjectRole !== undefined) {
      result.settings.defaultProjectRole = String(s.defaultProjectRole);
    }
    if (s.allowGuestInvites !== undefined) {
      result.settings.allowGuestInvites = Boolean(s.allowGuestInvites);
    }
  }
  return result;
}

export function validateInviteMember(body: unknown): {
  email: string;
  role: WorkspaceRole;
} {
  if (!body || typeof body !== "object") {
    throw new AppError(422, "Request body is required", "VALIDATION_ERROR");
  }
  const { email, role } = body as Record<string, unknown>;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw new AppError(422, "Valid email is required", "VALIDATION_ERROR");
  }
  const resolvedRole: WorkspaceRole =
    role && VALID_ROLES.includes(role as WorkspaceRole)
      ? (role as WorkspaceRole)
      : "MEMBER";
  return { email: String(email).toLowerCase().trim(), role: resolvedRole };
}

export function validateUpdateMemberRole(body: unknown): {
  role: WorkspaceRole;
} {
  if (!body || typeof body !== "object") {
    throw new AppError(422, "Request body is required", "VALIDATION_ERROR");
  }
  const { role } = body as Record<string, unknown>;
  if (!role || !VALID_ROLES.includes(role as WorkspaceRole)) {
    throw new AppError(
      422,
      `Role must be one of: ${VALID_ROLES.join(", ")}`,
      "VALIDATION_ERROR",
    );
  }
  return { role: role as WorkspaceRole };
}
