type RetryClassification = {
  retryable: boolean;
  reason: "HTTP_4XX" | "HTTP_429" | "HTTP_5XX" | "NETWORK" | "TIMEOUT" | "UNKNOWN";
  category: "TECHNICAL" | "BUSINESS" | "RATE_LIMIT" | "UNKNOWN";
  errorMessage: string;
  httpStatus?: number;
  errorName: string;
};

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  response?: {
    status?: unknown;
    statusText?: unknown;
    data?: unknown;
  };
};

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout"
};

const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ECONNABORTED"]);
const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
  "EHOSTUNREACH"
]);

export function classifyRetry(error: unknown): RetryClassification {
  const errorLike = toErrorLike(error);
  const httpStatus = toHttpStatus(errorLike.response?.status);
  const code = toText(errorLike.code);
  const errorName = toText(errorLike.name) || "Error";
  const baseMessage = toText(errorLike.message) || String(error);

  if (httpStatus !== undefined) {
    const statusName = httpStatusName(httpStatus, errorLike.response?.statusText);
    const message = `HTTP ${httpStatus} ${statusName}: ${baseMessage}`;

    if (httpStatus === 429) {
      return {
        retryable: true,
        reason: "HTTP_429",
        category: "RATE_LIMIT",
        errorMessage: message,
        httpStatus,
        errorName: statusName
      };
    }

    if (httpStatus >= 400 && httpStatus < 500) {
      return {
        retryable: false,
        reason: "HTTP_4XX",
        category: "BUSINESS",
        errorMessage: message,
        httpStatus,
        errorName: statusName
      };
    }

    if (httpStatus >= 500 && httpStatus < 600) {
      return {
        retryable: true,
        reason: "HTTP_5XX",
        category: "TECHNICAL",
        errorMessage: message,
        httpStatus,
        errorName: statusName
      };
    }
  }

  if (code && TIMEOUT_CODES.has(code)) {
    return {
      retryable: true,
      reason: "TIMEOUT",
      category: "TECHNICAL",
      errorMessage: `${code} Timeout: ${baseMessage}`,
      errorName: "Timeout"
    };
  }

  if (code && NETWORK_CODES.has(code)) {
    return {
      retryable: true,
      reason: "NETWORK",
      category: "TECHNICAL",
      errorMessage: `${code} Network Error: ${baseMessage}`,
      errorName: "Network Error"
    };
  }

  return {
    retryable: true,
    reason: "UNKNOWN",
    category: "UNKNOWN",
    errorMessage: baseMessage,
    errorName
  };
}

function toErrorLike(error: unknown): ErrorLike {
  if (typeof error === "object" && error !== null) {
    return error as ErrorLike;
  }
  return {
    name: "Error",
    message: String(error)
  };
}

function toHttpStatus(value: unknown): number | undefined {
  const status = typeof value === "number" ? value : Number(value);
  return Number.isInteger(status) ? status : undefined;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function httpStatusName(status: number, statusText: unknown): string {
  return toText(statusText) ?? HTTP_STATUS_NAMES[status] ?? "HTTP Error";
}
