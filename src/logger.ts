export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimeLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function normalizeContext(context?: Record<string, unknown>) {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error
        ? {
            name: value.name,
            message: value.message,
            stack: value.stack,
          }
        : typeof value === "bigint"
          ? value.toString()
          : value,
    ]),
  );
}

function write(level: RuntimeLogLevel, message: string, context?: Record<string, unknown>) {
  const payload = {
    level,
    scope: "agentpact-runtime",
    message,
    timestamp: new Date().toISOString(),
    context: normalizeContext(context),
  };
  const line = JSON.stringify(payload);
  if (level === "error" || level === "warn") {
    console.error(line);
    return;
  }
  console.log(line);
}

export const runtimeLogger: RuntimeLogger = {
  debug: (message, context) => write("debug", message, context),
  info: (message, context) => write("info", message, context),
  warn: (message, context) => write("warn", message, context),
  error: (message, context) => write("error", message, context),
};
