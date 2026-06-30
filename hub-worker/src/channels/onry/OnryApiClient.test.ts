import type { AxiosResponse } from "axios";
import { jest } from "@jest/globals";
import { OnryApiClient, type OnryHttpClient } from "./OnryApiClient.js";

describe("OnryApiClient", () => {
  it("logs in with X-API-Key and company credentials", async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        token_type: "bearer",
        access_token: "access-token",
        refresh_token: "refresh-token"
      }
    } as never);
    const client = new OnryApiClient(
      { post, get: jest.fn() } as unknown as OnryHttpClient,
      "api-key"
    );

    await expect(client.login("company-1", "password")).resolves.toEqual({
      accessToken: "access-token"
    });
    expect(post).toHaveBeenCalledWith(
      "/auth/company/login",
      { company_id: "company-1", password: "password" },
      { headers: { "X-API-Key": "api-key" } }
    );
  });

  it("collects paged order products with a bearer token", async () => {
    const get = jest.fn<(...args: unknown[]) => Promise<AxiosResponse>>()
      .mockResolvedValueOnce(orderResponse(2, 1, [rawOrder(1, "ORDER-1")]))
      .mockResolvedValueOnce(orderResponse(2, 2, [rawOrder(2, "ORDER-2")]));
    const client = new OnryApiClient(
      { post: jest.fn(), get } as unknown as OnryHttpClient,
      "api-key"
    );

    const orders = await client.fetchOrders("access-token", "20260601", "20260630");

    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({ id: 1, order_number: "ORDER-1", price: 1000 });
    expect(get).toHaveBeenNthCalledWith(1, "/companies/me/order-products", {
      headers: {
        Authorization: "Bearer access-token",
        "X-API-Key": "api-key"
      },
      params: {
        page: 1,
        size: 100,
        date_type: "paid",
        from_date: "2026-06-01",
        to_date: "2026-06-30"
      }
    });
    expect(get).toHaveBeenNthCalledWith(2, "/companies/me/order-products", expect.objectContaining({
      params: expect.objectContaining({ page: 2 })
    }));
  });

  it("requires an API key before login", async () => {
    const client = new OnryApiClient(
      { post: jest.fn(), get: jest.fn() } as unknown as OnryHttpClient,
      ""
    );

    await expect(client.login("company-1", "password"))
      .rejects.toThrow("ONRY_X_API_KEY is required");
  });
});

function orderResponse(total: number, page: number, items: Array<Record<string, unknown>>): AxiosResponse {
  return {
    data: { total, page, size: 100, items },
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as AxiosResponse["config"]
  };
}

function rawOrder(id: number, orderNumber: string): Record<string, unknown> {
  return {
    id,
    order_number: orderNumber,
    product_code: `PRODUCT-${id}`,
    quantity: 1,
    price: "1000",
    shipping_status: "배송대기"
  };
}
