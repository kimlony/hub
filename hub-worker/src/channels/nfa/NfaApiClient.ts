import axios, { type AxiosInstance } from "axios";
import bcrypt from "bcryptjs";
import { logger } from "../../logger.js";

type NfaTokenResponse = {
  access_token?: string;
};

type NfaOrdersResponse = {
  data?: {
    contents?: Record<string, unknown>[];
  };
};

export class NfaApiClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://api.commerce.naver.com",
      timeout: 30000
    });
  }

  async fetchOrders(
    clientId: string,
    clientSecret: string,
    frDt: string,
    toDt: string
  ): Promise<Record<string, unknown>[]> {
    const timestamp = String(Date.now());
    const signature = getSignature(clientId, clientSecret, timestamp);
    logger.debug({
      event: "NSS_TOKEN_REQUEST_SIGNED",
      hasClientId: Boolean(clientId),
      clientIdLength: clientId.length,
      hasClientSecret: Boolean(clientSecret),
      clientSecretLength: clientSecret.length,
      timestamp,
      signatureLength: signature.length
    }, "NSS token request signed");
    const token = await this.getToken(clientId, signature, timestamp);
    const rawOrders: Record<string, unknown>[] = [];

    for (const day of eachDate(frDt, toDt)) {
      const response = await this.client.get<NfaOrdersResponse>(
        "/external/v1/pay-order/seller/product-orders",
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
                    params: buildNfaOrderParams(day)
        }
      );
      rawOrders.push(...(response.data.data?.contents ?? []));
    }

    return rawOrders;
  }

  private async getToken(
    clientId: string,
    signature: string,
    timestamp: string
  ): Promise<string> {
    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("timestamp", timestamp);
    body.set("client_secret_sign", signature);
    body.set("grant_type", "client_credentials");
    body.set("type", "SELF");

    const response = await this.client.post<NfaTokenResponse>(
      "/external/v1/oauth2/token",
      body.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const token = response.data.access_token;
    if (!token) {
      throw new Error("NFA token response missing access_token");
    }

    return token;
  }
}

export function buildNfaOrderParams(day: string) {
  return {
    from: `${day}T00:00:00.000+09:00`,
    to: `${day}T23:59:59.999+09:00`,
    rangeType: "ORDERED_DATETIME",
    fulfillment: "true"
  };
}
function getSignature(clientId: string, clientSecret: string, timestamp: string): string {
  const password = `${clientId}_${timestamp}`;
  const hashedPassword = bcrypt.hashSync(password, clientSecret);
  return Buffer.from(hashedPassword, "utf-8").toString("base64url");
}

function eachDate(frDt: string, toDt: string): string[] {
  const start = parseYmd(frDt);
  const end = parseYmd(toDt);

  if (start.getTime() > end.getTime()) {
    throw new Error(`Invalid date range: frDt(${frDt}) is after toDt(${toDt})`);
  }

  const days: string[] = [];
  for (const current = start; current.getTime() <= end.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
    days.push(formatIsoDate(current));
  }

  return days;
}

function parseYmd(value: string): Date {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8))
  ));
}

function formatIsoDate(value: Date): string {
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
