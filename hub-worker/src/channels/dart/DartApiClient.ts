import axios, { type AxiosInstance } from "axios";
import type { DartApiResponse, DartDisclosure } from "./types.js";

export class DartApiClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://opendart.fss.or.kr/api",
      timeout: 15000
    });
  }

  async fetchDisclosures(frDt: string, toDt: string): Promise<DartDisclosure[]> {
    const apiKey = process.env.DART_API_KEY;
    if (!apiKey) {
      throw new Error("DART_API_KEY is required");
    }

    const response = await this.client.get<DartApiResponse>("/list.json", {
      params: {
        crtfc_key: apiKey,
        bgn_de: frDt,
        end_de: toDt,
        sort: "date",
        sort_mth: "desc",
        page_count: 100
      }
    });

    const data = response.data;
    if (data.status !== "000") {
      throw new Error(`DART API failed: ${data.status} ${data.message ?? ""}`.trim());
    }

    return (data.list ?? [])
      .filter((item) => item.rcept_no && item.report_nm && item.rcept_dt)
      .map((item) => ({
        corpName: item.corp_name ?? "",
        title: item.report_nm ?? "",
        publishedAt: parseDartDate(item.rcept_dt ?? ""),
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`
      }));
  }
}

function parseDartDate(value: string): Date {
  if (/^\d{8}$/.test(value)) {
    const yyyy = value.slice(0, 4);
    const mm = value.slice(4, 6);
    const dd = value.slice(6, 8);
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`);
  }
  return new Date();
}
