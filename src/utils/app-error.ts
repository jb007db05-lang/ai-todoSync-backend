export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, message: string, code = "INTERNAL_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const isAppError = (value: unknown): value is AppError =>
  value instanceof AppError ||
  (typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status?: unknown }).status === "number");
