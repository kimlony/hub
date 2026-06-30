import { normalizeOrderStatus } from "./OrderStatusNormalizer.js";

describe("OrderStatusNormalizer", () => {
  it.each([
    ["PAYED", "결제완료"],
    ["PAYMENT_COMPLETE", "결제완료"],
    ["p1", "결제완료"],
    ["READY_TO_SHIP", "상품준비중"],
    ["FINAL_DELIVERY", "배송완료"],
    ["CANCEL_REQUESTED", "취소접수"],
    ["RETURNED", "반품완료"],
    ["EXCHANGE_DELIVERED", "교환완료"]
  ])("채널 상태 %s를 공통 한글 상태로 변환한다", (rawStatus, expected) => {
    expect(normalizeOrderStatus(rawStatus)).toBe(expected);
  });

  it("여러 상태가 있으면 더 진행된 상태를 선택한다", () => {
    expect(normalizeOrderStatus("PAID", "SHIPPING")).toBe("배송중");
  });

  it("알 수 없거나 비어 있는 상태를 확인 대상으로 표시한다", () => {
    expect(normalizeOrderStatus("UNKNOWN_STATUS")).toBe("상태확인필요");
    expect(normalizeOrderStatus(null)).toBe("상태확인필요");
  });
});
