import type { AxiosResponse } from "axios";
import { jest } from "@jest/globals";
import { WchanApiClient, type WchanHttpClient } from "./WchanApiClient.js";

describe("WchanApiClient", () => {
  it("extracts JSESSIONID from the login redirect response", async () => {
    const post = jest.fn().mockResolvedValue({
      headers: {
        location: "/admin",
        "set-cookie": ["JSESSIONID=session-123; Path=/; HttpOnly"]
      }
    } as never);
    const client = new WchanApiClient({ post, get: jest.fn() } as unknown as WchanHttpClient);

    await expect(client.login("seller", "password")).resolves.toEqual({
      sessionKey: "session-123"
    });
    expect(post).toHaveBeenCalledWith(
      "/admin/login-request",
      "mbsd_id=seller&mbsd_pass=password",
      expect.objectContaining({
        maxRedirects: 0,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      })
    );
  });

  it("rejects a login redirect that does not issue a session cookie", async () => {
    const post = jest.fn().mockResolvedValue({
      headers: { location: "/admin/login?fail=true" }
    } as never);
    const client = new WchanApiClient({ post, get: jest.fn() } as unknown as WchanHttpClient);

    await expect(client.login("seller", "wrong-password"))
      .rejects.toThrow("WCHAN login failed: invalid seller ID or password");
  });

  it("uses the session cookie and collects all order pages", async () => {
    const get = jest.fn<(...args: unknown[]) => Promise<AxiosResponse>>()
      .mockResolvedValueOnce(orderResponse(1, 2, [{
        rdmg_code: "ORDER-1",
        rdmg_index: "1",
        rdmg_order_status: "2",
        rdmg_price: "1500"
      }]))
      .mockResolvedValueOnce(orderResponse(2, 2, [{
        rdmg_code: "ORDER-2",
        rdmg_index: 2,
        rdmg_order_status: 4,
        rdmg_price: 3000
      }]));
    const client = new WchanApiClient({ post: jest.fn(), get } as unknown as WchanHttpClient);

    const orders = await client.fetchOrders(
      "session-123",
      "seller",
      "20260601",
      "20260630"
    );

    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      rdmg_code: "ORDER-1",
      rdmg_index: 1,
      rdmg_order_status: 2,
      rdmg_price: 1500
    });
    expect(get).toHaveBeenNthCalledWith(1, "/admin/sell/erp/order/list", {
      headers: { Cookie: "JSESSIONID=session-123" },
      maxRedirects: 0,
      params: {
        mbsd_id: "seller",
        search_day_from_: "20260601",
        search_day_to_: "20260630",
        list_count_: "100",
        currPage: 1
      }
    });
    expect(get).toHaveBeenNthCalledWith(2, "/admin/sell/erp/order/list", expect.objectContaining({
      params: expect.objectContaining({ currPage: 2 })
    }));
  });
});

function orderResponse(
  currentPage: number,
  totalPage: number,
  selectOrderList: Array<Record<string, unknown>>
): AxiosResponse {
  return {
    data: {
      navi: {
        currPage: currentPage,
        totalPage,
        totalRec: selectOrderList.length
      },
      selectOrderList
    },
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as AxiosResponse["config"]
  };
}
