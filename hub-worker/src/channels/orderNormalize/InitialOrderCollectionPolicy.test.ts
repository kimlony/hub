import {
  initialCollectionStatuses,
  isInitialCollectionStatus
} from "./InitialOrderCollectionPolicy.js";

describe("initial order collection policy", () => {
  it.each([
    "결제완료",
    "주문완료",
    "상품준비중",
    "배송준비"
  ])("allows %s", (status) => {
    expect(isInitialCollectionStatus(status)).toBe(true);
  });

  it.each([
    "결제대기",
    "배송중",
    "배송완료",
    "취소접수",
    "취소완료",
    "상태확인필요"
  ])("rejects %s", (status) => {
    expect(isInitialCollectionStatus(status)).toBe(false);
  });

  it("exposes the configured statuses for logging", () => {
    expect(initialCollectionStatuses()).toEqual([
      "결제완료",
      "주문완료",
      "상품준비중",
      "배송준비"
    ]);
  });
});
