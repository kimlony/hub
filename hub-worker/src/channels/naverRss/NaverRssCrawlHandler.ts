import { createHash } from "node:crypto";
import { saveJobLog, saveNews } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { NaverRssClient } from "./NaverRssClient.js";

export class NaverRssCrawlHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const client = new NaverRssClient();
    const items = await client.fetchAll();

    const result = await saveNews(items.map((item) => ({
      source: "NAVER_RSS",
      category: "속보",
      title: item.title,
      summary: item.summary,
      url: item.url,
      contentHash: createHash("sha256").update(`NAVER_RSS:${item.url}`).digest("hex"),
      publishedAt: item.publishedAt
    })));

    logger.info({
      event: "CRAWL_COMPLETED",
      requestId: message.requestId,
      source: "NAVER_RSS",
      total: items.length,
      inserted: result.inserted,
      skipped: result.skipped
    }, "Naver RSS crawl completed");

    await saveJobLog({
      requestId: message.requestId,
      eventType: "CRAWL_COMPLETED",
      level: "INFO",
      message: "Naver RSS crawl completed",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: "NAVER_RSS",
      detail: {
        source: "NAVER_RSS",
        total: items.length,
        inserted: result.inserted,
        skipped: result.skipped
      }
    });
  }
}
