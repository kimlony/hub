import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../../logger.js";
import type { RssItem } from "./types.js";

const DEFAULT_RSS_URLS = [
  "https://www.yna.co.kr/rss/economy.xml",
  "https://www.hankyung.com/feed/economy"
];

export class NaverRssClient {
  async fetchAll(): Promise<RssItem[]> {
    const items: RssItem[] = [];

    for (const url of getRssUrls()) {
      try {
        const fetchedItems = await this.fetchOne(url);
        if (fetchedItems.length === 0) {
          logger.warn({
            event: "NAVER_RSS_EMPTY_FEED",
            url
          }, "Naver RSS feed returned no items");
        }
        items.push(...fetchedItems);
      } catch (error) {
        logger.warn({
          event: "NAVER_RSS_FETCH_FAILED",
          err: error,
          url
        }, "Naver RSS fetch failed");
      }
    }

    if (items.length === 0) {
      throw new Error("NAVER_RSS returned no items");
    }

    return items;
  }

  private async fetchOne(url: string): Promise<RssItem[]> {
    const response = await axios.get<string>(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true
    });
    const parsed = parser.parse(response.data) as unknown;
    const channel = toRecord(toRecord(parsed).rss).channel ?? toRecord(parsed).channel;
    const items = toArray(toRecord(channel).item);

    return items
      .map((item) => toRecord(item))
      .map((item) => ({
        title: toStringValue(item.title),
        url: toStringValue(item.link),
        summary: cleanSummary(item.description),
        publishedAt: parsePubDate(item.pubDate)
      }))
      .filter((item) => item.title && item.url);
  }
}

function getRssUrls(): string[] {
  const configuredUrls = process.env.NAVER_RSS_URLS?.trim();

  return (configuredUrls || DEFAULT_RSS_URLS.join(","))
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function cleanSummary(value: unknown): string | undefined {
  const summary = toStringValue(value).replace(/<[^>]*>/g, "").trim().slice(0, 200);
  return summary || undefined;
}

function parsePubDate(value: unknown): Date {
  const parsed = new Date(toStringValue(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}
