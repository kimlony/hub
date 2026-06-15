// src/server.ts
import type { Server } from "node:http";
import express, { type Request, type Response } from "express";
import { CollectHandlerRegistry } from "./handlers/CollectHandlerRegistry.js";
import { ElevenStCollectHandler } from "./channels/elevenst/ElevenStCollectHandler.js";
import { GchanCollectHandler } from "./channels/gchan/GchanCollectHandler.js";
import { CoupangCollectHandler } from "./channels/coupang/CoupangCollectHandler.js";
import { NfaCollectHandler } from "./channels/nfa/NfaCollectHandler.js";
import type { JobHandlerMessage } from "./handlers/IJobHandler.js";
import { getErrorMessage, logger } from "./logger.js";
import { CollectRequestSchema } from "./schemas.js";

export function createApp(): express.Application {
  const registry = new CollectHandlerRegistry();
  registry.register("11ST", new ElevenStCollectHandler());
  registry.register("GCHAN", new GchanCollectHandler());
  registry.register("COUPANG", new CoupangCollectHandler());
  registry.register("NSS", new NfaCollectHandler()); // NSS = 네이버 스마트스토어 (nfa folder)

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req: Request, res: Response): void => {
    res.json({ status: "ok" });
  });

  app.post("/collect", async (req: Request, res: Response): Promise<void> => {
    const parseResult = CollectRequestSchema.safeParse(req.body);
    const requestId = parseResult.success ? parseResult.data.requestId : "unknown";

    if (!parseResult.success) {
      res.status(400).json({
        requestId,
        error: "Invalid collect request format",
        issues: parseResult.error.issues
      });
      return;
    }

    const request = parseResult.data as typeof parseResult.data & Record<string, unknown>;
    const message: JobHandlerMessage = {
      requestId,
      sourceErp: typeof request.sourceErp === "string" ? request.sourceErp : "HTTP",
      jobType: typeof request.jobType === "string" ? request.jobType : "ORDER_COLLECT",
      requestKey: typeof request.requestKey === "string" ? request.requestKey : requestId,
      payload: parseResult.data.payload
    };
    const channelCd = String(message.payload.channelCd ?? "");
    logger.info({
      event: "HTTP_COLLECT_REQUEST_RECEIVED",
      requestId,
      channelCd,
      path: "/collect"
    }, "Collect request received");

    const handler = registry.get(channelCd);
    if (!handler) {
      logger.warn({
        event: "HTTP_COLLECT_UNSUPPORTED_CHANNEL",
        requestId,
        channelCd
      }, "Unsupported collect channel");
      res.status(400).json({ requestId, error: `unsupported channelCd: ${channelCd}` });
      return;
    }

    try {
      const result = await handler.handle(message);
      logger.info({
        event: "HTTP_COLLECT_COMPLETED",
        requestId,
        channelCd,
        totalCount: result.totalCount
      }, "Collect request completed");
      res.json(result);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error({
        event: "HTTP_COLLECT_FAILED",
        err: error,
        requestId,
        channelCd,
        errorMessage
      }, "Collect request failed");
      res.status(500).json({ requestId, error: errorMessage });
    }
  });

  return app;
}

export function startServer(port: number): Server {
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info({
      event: "HTTP_SERVER_STARTED",
      port
    }, "HTTP server listening");
  });
  server.on("error", (error: Error) => {
    logger.error({
      event: "HTTP_SERVER_START_FAILED",
      err: error,
      port,
      errorMessage: error.message
    }, "HTTP server failed to start");
    process.exit(1);
  });
  return server;
}
