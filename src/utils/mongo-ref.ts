import { Types } from "mongoose";

export const isValidObjectId = (value: unknown): value is string =>
  typeof value === "string" && Types.ObjectId.isValid(value);

export const toObjectId = (value: string): Types.ObjectId | null =>
  isValidObjectId(value) ? new Types.ObjectId(value) : null;

export const buildRefMatch = (field: string, value: string) => ({
  $expr: {
    $eq: [{ $toString: `$${field}` }, value],
  },
});

export const buildRefInMatch = (field: string, values: string[]) => ({
  $expr: {
    $in: [{ $toString: `$${field}` }, values],
  },
});

/**
 * Standard MongoDB query match that works correctly with arrays and allows index usage.
 * Use this instead of buildRefMatch for fields that might be arrays (like subtask assignees).
 */
export const buildSafeRefMatch = (field: string, value: string) => {
  const oid = toObjectId(value);
  return { [field]: oid || value };
};

export const buildSafeRefInMatch = (field: string, values: string[]) => {
  const oids = values.map((v) => toObjectId(v) || v);
  return { [field]: { $in: oids } };
};

export const andRefMatches = (...matches: Array<Record<string, unknown>>) => ({
  $and: matches,
});
