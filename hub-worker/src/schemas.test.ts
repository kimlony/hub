import { ZodError } from "zod";
import {
  CollectRequestSchema,
  HubJobMessageSchema
} from "./schemas.js";

describe("HubJobMessageSchema", () => {
  it("parses a valid message", () => {
    const message = HubJobMessageSchema.parse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: 1,
        frDt: "20260601",
        toDt: "20260601"
      }
    });

    expect(message.requestId).toBe("request-1");
    expect(message.payload.mallKey).toBe("GODO");
  });

  it("fails with ZodError when requestId is missing", () => {
    expect(() => HubJobMessageSchema.parse({
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: 1
      }
    })).toThrow(ZodError);
  });

  it("fails when jobType is an empty string", () => {
    const result = HubJobMessageSchema.safeParse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: 1
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["jobType"]);
    }
  });

  it("fails when payload.mallKey is missing", () => {
    const result = HubJobMessageSchema.safeParse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        channelCd: "GODO",
        userId: 1
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "payload.mallKey")).toBe(true);
    }
  });

  it("parses when payload.userId is a number", () => {
    const message = HubJobMessageSchema.parse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: 1
      }
    });

    expect(message.payload.userId).toBe(1);
  });

  it("parses when payload.userId is a numeric string", () => {
    const message = HubJobMessageSchema.parse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: "1"
      }
    });

    expect(message.payload.userId).toBe("1");
  });

  it("CollectRequestSchema fails for 400 handling when requestId is missing", () => {
    const result = CollectRequestSchema.safeParse({
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: 1
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "requestId")).toBe(true);
    }
  });

  it("passes through additional fields", () => {
    const message = HubJobMessageSchema.parse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      requestKey: "GODO_20260601_20260601_admin",
      payload: {
        mallKey: "GODO",
        channelCd: "GODO",
        userId: 1,
        frDt: "20260601",
        toDt: "20260601",
        customField: "kept"
      }
    });

    expect(message.payload.frDt).toBe("20260601");
    expect(message.payload.customField).toBe("kept");
  });

  it("parses crawl messages without order credential fields", () => {
    const message = HubJobMessageSchema.parse({
      requestId: "request-1",
      sourceErp: "HUB",
      jobType: "CRAWL",
      requestKey: "DART_20260602",
      payload: {
        channelCd: "DART",
        frDt: "20260602",
        toDt: "20260602"
      }
    });

    expect(message.jobType).toBe("CRAWL");
    expect(message.payload.channelCd).toBe("DART");
  });
});
