import { classifyRetry } from "./retryPolicy.js";

describe("retryPolicy", () => {
  it("marks HTTP 4xx errors as non-retryable and includes status/name in the message", () => {
    const result = classifyRetry({
      name: "AxiosError",
      message: "Request failed with status code 401",
      response: {
        status: 401,
        statusText: "Unauthorized"
      }
    });

    expect(result).toMatchObject({
      retryable: false,
      reason: "HTTP_4XX",
      httpStatus: 401,
      errorName: "Unauthorized"
    });
    expect(result.errorMessage).toContain("HTTP 401 Unauthorized");
  });

  it("marks HTTP 404 as non-retryable", () => {
    const result = classifyRetry({
      message: "Request failed with status code 404",
      response: {
        status: 404
      }
    });

    expect(result.retryable).toBe(false);
    expect(result.errorMessage).toContain("HTTP 404 Not Found");
  });

  it("marks HTTP 5xx errors as retryable", () => {
    const result = classifyRetry({
      message: "Request failed with status code 502",
      response: {
        status: 502,
        statusText: "Bad Gateway"
      }
    });

    expect(result).toMatchObject({
      retryable: true,
      reason: "HTTP_5XX",
      httpStatus: 502,
      errorName: "Bad Gateway"
    });
  });

  it("marks timeout and network codes as retryable", () => {
    expect(classifyRetry({ code: "ETIMEDOUT", message: "timeout" })).toMatchObject({
      retryable: true,
      reason: "TIMEOUT"
    });
    expect(classifyRetry({ code: "ECONNRESET", message: "socket hang up" })).toMatchObject({
      retryable: true,
      reason: "NETWORK"
    });
  });
});
