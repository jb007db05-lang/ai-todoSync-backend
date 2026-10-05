/**
 * Every automated case is also a row in the test-case catalog
 * (tests/TEST_CASES.csv), so the catalog always matches what actually runs.
 */
export type CaseLevel = "unit" | "service" | "e2e";

export interface CatalogCase {
  id: string;
  module: string;
  feature: string;
  title: string;
  preconditions: string;
  steps: string;
  expected: string;
  level: CaseLevel;
  /** Test file that executes this case. */
  automatedBy: string;
}

export const pad = (n: number, width = 4): string =>
  String(n).padStart(width, "0");

export const describeValue = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** Deterministic PRNG (mulberry32) so generated cases are stable across runs. */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];

export const randomInt = (
  rand: () => number,
  min: number,
  max: number,
): number => Math.floor(rand() * (max - min + 1)) + min;

export const randomString = (
  rand: () => number,
  length: number,
  alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .*+?^${}()|[]\\/-_é漢😀",
): string => {
  const chars = Array.from(alphabet);
  let out = "";
  for (let i = 0; i < length; i++) out += pick(rand, chars);
  return out;
};
