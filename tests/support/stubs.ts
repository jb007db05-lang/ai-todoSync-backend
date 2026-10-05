/** Replaces target[key] and returns a function that restores it. */
export const stub = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  impl: T[K],
): (() => void) => {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
};

/**
 * Stand-in for a mongoose query: awaitable, and every chain method
 * (sort, select, lean, session, populate, skip, limit, exec) returns itself.
 */
export const chain = (value: unknown): any => {
  const promise: any = Promise.resolve(value);
  for (const method of [
    "sort",
    "select",
    "lean",
    "session",
    "populate",
    "skip",
    "limit",
    "exec",
  ]) {
    promise[method] = () => promise;
  }
  return promise;
};
