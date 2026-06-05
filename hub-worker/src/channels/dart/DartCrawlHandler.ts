import { createHash } from "node:crypto";
import { saveJobLog, saveNews } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";
import { DartApiClient } from "./DartApiClient.js";

export class DartCrawlHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const { frDt, toDt } = parsePayload(message.payload);
    const client = new DartApiClient();
    const disclosures = await client.fetchDisclosures(frDt, toDt);

    const result = await saveNews(disclosures.map((disclosure) => ({
      source: "DART",
      category: "공시",
      title: disclosure.title,
      url: disclosure.url,
      corpName: disclosure.corpName,
      contentHash: createHash("sha256").update(`DART:${disclosure.url}`).digest("hex"),
      publishedAt: disclosure.publishedAt
    })));

    logger.info({
      event: "CRAWL_COMPLETED",
      requestId: message.requestId,
      source: "DART",
      total: disclosures.length,
      inserted: result.inserted,
      skipped: result.skipped
    }, "DART crawl completed");

    await saveJobLog({
      requestId: message.requestId,
      eventType: "CRAWL_COMPLETED",
      level: "INFO",
      message: "DART crawl completed",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: "DART",
      detail: {
        source: "DART",
        frDt,
        toDt,
        total: disclosures.length,
        inserted: result.inserted,
        skipped: result.skipped
      }
    });
  }
}

function parsePayload(payload: Record<string, unknown>): { frDt: string; toDt: string } {
  const today = todayKst();
  return {
    frDt: optionalDate(payload.frDt) ?? today,
    toDt: optionalDate(payload.toDt) ?? today
  };
}

function optionalDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{8}$/.test(value)) {
    return value;
  }
  return null;
}

function todayKst(): string {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}${month}${day}`;
}
