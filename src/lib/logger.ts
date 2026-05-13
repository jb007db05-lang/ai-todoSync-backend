type LogLevel = "info" | "warn" | "error";

type Meta = Record<string, unknown> | Error | undefined;

class Logger {
  private formatPayload(level: LogLevel, message: string, meta?: Meta) {
    const normalizedMeta =
      meta instanceof Error
        ? {
            name: meta.name,
            message: meta.message,
            stack: meta.stack,
          }
        : meta
          ? meta
          : null;
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: normalizedMeta,
    };
  }

  private log(level: LogLevel, message: string, meta?: Meta) {
    const payload = this.formatPayload(level, message, meta);
    console[level](JSON.stringify(payload));
  }

  public info(message: string, meta?: Meta) {
    this.log("info", message, meta);
  }

  public debug(message: string, meta?: Meta) {
    // For now, treat debug as info but we can filter it later
    this.log("info", message, meta);
  }

  public warn(message: string, meta?: Meta) {
    this.log("warn", message, meta);
  }

  public error(message: string, meta?: Meta) {
    this.log("error", message, meta);
  }
}

const logger = new Logger();

export default logger;
