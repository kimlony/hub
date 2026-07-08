import { buildQueryString } from "../coupang/CoupangApiClient.js";
import { buildGchanOrderParams } from "../gchan/GchanApiClient.js";
import { buildNfaOrderParams } from "../nfa/NfaApiClient.js";
import { normalizeOrderStatus } from "./OrderStatusNormalizer.js";

describe("initial order API query policy", () => {
  it("sends required Coupang status and page size parameters", () => {
    const query = new URLSearchParams(buildQueryString("20260701", "20260706"));
    expect(query.get("createdAtFrom")).toBe("2026-07-01");
    expect(query.get("createdAtTo")).toBe("2026-07-06");
    expect(query.get("status")).toBe("ACCEPT");
    expect(query.get("maxPerPage")).toBe("50");
    expect(query.has("perPage")).toBe(false);
    expect(query.has("searchType")).toBe(false);
  });

  it("does not send a GCHAN received status filter", () => {
    expect(buildGchanOrderParams("20260701", "20260706", 1))
      .not.toHaveProperty("receivedStatus");
  });

  it("does not send an NSS product order status filter", () => {
    expect(buildNfaOrderParams("2026-07-01"))
      .not.toHaveProperty("productOrderStatuses");
  });

  it.each([
    ["주문확인", "주문완료"],
    ["발주확인", "상품준비중"],
    ["배송준비중", "배송준비"]
  ])("normalizes %s to the initial collection status %s", (source, expected) => {
    expect(normalizeOrderStatus(source)).toBe(expected);
  });
});
