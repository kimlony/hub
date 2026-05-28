import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "hub-worker"
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "key",
      "key2",
      "authKey",
      "apiKey",
      "secretKey",
      "mallPw",
      "password",
      "authorization",
      "Authorization",
      "headers.authorization",
      "headers.Authorization"
    ],
    censor: "[REDACTED]"
  }
});

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
