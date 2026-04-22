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

export const andRefMatches = (...matches: Array<Record<string, unknown>>) => ({
  $and: matches,
});
